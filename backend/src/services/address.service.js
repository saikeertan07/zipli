/**
 * @file address.service.js
 * @description Service for User Address Book management and Dark Store geofence serviceability (P0).
 */

const { query } = require('../config/db');
const { calculateHaversineDistance, isValidCoordinate } = require('../algo/geo');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

class AddressService {
  /**
   * Evaluates if a given coordinate is within any active dark store's delivery geofence.
   *
   * @param {Object} params
   * @param {number} [params.latitude]
   * @param {number} [params.longitude]
   * @param {string} [params.pincode]
   * @returns {Promise<{
   *   serviceable: boolean,
   *   storeId?: number,
   *   storeName?: string,
   *   distanceKm?: number,
   *   estimatedDeliveryMins?: number,
   *   reason?: string
   * }>}
   */
  async checkServiceability({ latitude, longitude, pincode = null }) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    // If coordinates are invalid or missing, fallback to pincode serviceability
    if (!isValidCoordinate({ lat, lng })) {
      if (pincode && (pincode.startsWith('500') || pincode.startsWith('560'))) {
        // Supported city prefix (Hyderabad 500xxx, Bengaluru 560xxx)
        const fallbackStore = pincode.startsWith('500') ? 4 : 1;
        return {
          serviceable: true,
          storeId: fallbackStore,
          storeName: pincode.startsWith('500') ? 'Hyderabad Express Hub' : 'Bengaluru Express Hub',
          distanceKm: 2.5,
          estimatedDeliveryMins: 10,
        };
      }
      return {
        serviceable: false,
        reason: 'Valid GPS coordinates or serviceable pincode required for 10-minute delivery.',
      };
    }

    const storesRes = await query(
      `SELECT id, code, name, city, lat, lng, service_radius_km
       FROM stores
       WHERE is_active = true`
    );

    const stores = storesRes.rows;
    if (stores.length === 0) {
      return { serviceable: false, reason: 'No active fulfillment dark stores found.' };
    }

    let nearestStore = null;
    let minDistance = Infinity;

    for (const store of stores) {
      try {
        const storeCoord = { lat: Number(store.lat), lng: Number(store.lng) };
        const dist = calculateHaversineDistance({ lat, lng }, storeCoord);

        if (dist <= Number(store.service_radius_km)) {
          if (dist < minDistance) {
            minDistance = dist;
            nearestStore = store;
          }
        }
      } catch (err) {
        logger.warn('Failed distance calculation for store', {
          storeId: store.id,
          error: err.message,
        });
      }
    }

    if (nearestStore) {
      return {
        serviceable: true,
        storeId: nearestStore.id,
        storeCode: nearestStore.code,
        storeName: nearestStore.name,
        distanceKm: Math.round(minDistance * 100) / 100,
        estimatedDeliveryMins: minDistance < 3 ? 10 : 15,
      };
    }

    return {
      serviceable: false,
      reason: `Address is outside our 10-minute dark store delivery perimeter.`,
    };
  }

  /**
   * Retrieves all saved addresses for a user.
   */
  async listUserAddresses(userId) {
    const { rows } = await query(
      `SELECT id, user_id, label, recipient_name, phone, address_line1, address_line2,
              landmark, city, pincode, latitude, longitude, is_default, created_at, updated_at
       FROM user_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Creates a new verified address for user.
   */
  async createAddress(userId, data) {
    const {
      label = 'Home',
      recipientName,
      phone,
      addressLine1,
      addressLine2 = null,
      landmark = null,
      city = 'Hyderabad',
      pincode,
      latitude = null,
      longitude = null,
      isDefault = false,
    } = data;

    // Serviceability verification
    const serviceability = await this.checkServiceability({
      latitude,
      longitude,
      pincode,
    });

    if (isDefault) {
      await query(`UPDATE user_addresses SET is_default = false WHERE user_id = $1`, [userId]);
    }

    const { rows } = await query(
      `INSERT INTO user_addresses (
         user_id, label, recipient_name, phone, address_line1, address_line2,
         landmark, city, pincode, latitude, longitude, is_default
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        userId,
        label,
        recipientName,
        phone,
        addressLine1,
        addressLine2,
        landmark,
        city,
        pincode,
        latitude,
        longitude,
        Boolean(isDefault),
      ]
    );

    const address = rows[0];
    return {
      address,
      serviceability,
    };
  }

  /**
   * Updates an existing address with ownership check.
   */
  async updateAddress(userId, addressId, updates) {
    const existingRes = await query(`SELECT id, user_id FROM user_addresses WHERE id = $1`, [
      Number(addressId),
    ]);

    if (existingRes.rows.length === 0) {
      throw new AppError('Address not found', 404);
    }

    if (existingRes.rows[0].user_id !== userId) {
      throw new AppError('Forbidden: you do not own this address', 403);
    }

    if (updates.isDefault) {
      await query(`UPDATE user_addresses SET is_default = false WHERE user_id = $1`, [userId]);
    }

    const allowedFields = [
      'label',
      'recipient_name',
      'phone',
      'address_line1',
      'address_line2',
      'landmark',
      'city',
      'pincode',
      'latitude',
      'longitude',
      'is_default',
    ];

    const setClauses = [];
    const params = [Number(addressId)];

    for (const field of allowedFields) {
      const camel = field.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
      const val = updates[field] !== undefined ? updates[field] : updates[camel];
      if (val !== undefined) {
        params.push(val);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      throw new AppError('No valid fields provided to update', 400);
    }

    params.push(userId);
    const { rows } = await query(
      `UPDATE user_addresses
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND user_id = $${params.length}
       RETURNING *`,
      params
    );

    return rows[0];
  }

  /**
   * Deletes an address with ownership check.
   */
  async deleteAddress(userId, addressId) {
    const res = await query(
      `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [Number(addressId), userId]
    );

    if (res.rowCount === 0) {
      throw new AppError('Address not found or unauthorized', 404);
    }

    return true;
  }
}

const addressService = new AddressService();

module.exports = {
  AddressService,
  addressService,
};
