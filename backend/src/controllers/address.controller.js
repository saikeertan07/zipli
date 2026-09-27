/**
 * @file address.controller.js
 * @description Controller for User Address Book and Serviceability Check (P0).
 */

const asyncHandler = require('../utils/asyncHandler');
const { addressService } = require('../services/address.service');
const AppError = require('../utils/AppError');

const listAddresses = asyncHandler(async (req, res) => {
  const addresses = await addressService.listUserAddresses(req.user.id);
  res.json({
    status: 'success',
    data: addresses,
  });
});

const createAddress = asyncHandler(async (req, res) => {
  const result = await addressService.createAddress(req.user.id, req.body);
  res.status(201).json({
    status: 'success',
    data: result.address,
    serviceability: result.serviceability,
  });
});

const updateAddress = asyncHandler(async (req, res) => {
  const addressId = Number(req.params.id);
  if (!addressId) {
    throw new AppError('Invalid address ID', 400);
  }
  const updated = await addressService.updateAddress(req.user.id, addressId, req.body);
  res.json({
    status: 'success',
    data: updated,
  });
});

const deleteAddress = asyncHandler(async (req, res) => {
  const addressId = Number(req.params.id);
  if (!addressId) {
    throw new AppError('Invalid address ID', 400);
  }
  await addressService.deleteAddress(req.user.id, addressId);
  res.json({
    status: 'success',
    message: 'Address deleted successfully',
  });
});

const checkServiceability = asyncHandler(async (req, res) => {
  const { latitude, longitude, pincode } = req.body;
  const result = await addressService.checkServiceability({ latitude, longitude, pincode });
  res.json({
    status: 'success',
    data: result,
  });
});

module.exports = {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  checkServiceability,
};
