/**
 * Central Zod Schemas for Edge Validation (Rule R03, SEC-AZ-04)
 * Strict mode enabled across all schemas to reject unrecognized/undeclared keys.
 */

const { z } = require('zod');

// 1. Auth Schemas
const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    email: z
      .string()
      .trim()
      .email('A valid email is required')
      .transform((val) => val.toLowerCase()),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one digit'),
    phone: z.string().max(20).optional().nullable(),
    address: z.string().max(255).optional().nullable(),
  })
  .strict();

const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email('A valid email is required')
      .transform((val) => val.toLowerCase()),
    password: z.string().min(1, 'Password is required'),
    mfaCode: z.string().trim().length(6).optional(),
    mfa_code: z.string().trim().length(6).optional(),
  })
  .strict();

const mfaVerifySchema = z
  .object({
    code: z
      .string()
      .trim()
      .length(6, 'TOTP code must be 6 digits')
      .regex(/^\d+$/, 'Code must be numeric'),
  })
  .strict();

// 2. Cart Schemas
const addToCartSchema = z
  .object({
    productId: z.number().int().positive('productId must be a positive integer'),
    quantity: z
      .number()
      .int()
      .positive('quantity must be a positive integer')
      .optional()
      .default(1),
  })
  .strict();

const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(0, 'quantity must be 0 or a positive integer'),
  })
  .strict();

const applyCouponSchema = z
  .object({
    code: z.string().trim().min(1, 'Coupon code cannot be empty'),
  })
  .strict();

// 3. Order Schemas
const createOrderSchema = z
  .object({
    deliveryAddress: z.string().max(255).optional().nullable(),
    delivery_address: z.string().max(255).optional().nullable(),
    deliveryAddressId: z.number().int().positive().optional().nullable(),
    delivery_address_id: z.number().int().positive().optional().nullable(),
    deliveryLat: z.number().optional().nullable(),
    delivery_lat: z.number().optional().nullable(),
    deliveryLng: z.number().optional().nullable(),
    delivery_lng: z.number().optional().nullable(),
    couponCode: z.string().max(40).optional().nullable(),
    coupon_code: z.string().max(40).optional().nullable(),
  })
  .strict();

const cancelOrderSchema = z
  .object({
    reason: z.string().max(255).optional(),
  })
  .strict();

// 4. Assistant Schemas
const assistantChatSchema = z
  .object({
    message: z.string().trim().min(1, 'Message is required').max(1000),
    conversationId: z.string().trim().max(128).optional(),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().trim().min(1).max(1000),
        })
      )
      .max(10)
      .optional(),
  })
  .strict();

const assistantFeedbackSchema = z
  .object({
    rating: z
      .number()
      .int()
      .refine((val) => [-1, 1].includes(val), 'Rating must be 1 or -1'),
    messageId: z.string().optional(),
    conversationId: z.string().optional(),
    comment: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

const recipeToCartSchema = z
  .object({
    dish: z.string().trim().min(2, 'Dish name is required').max(200),
    servings: z.number().int().min(1).max(12).optional().default(2),
  })
  .strict();

// 5. Pricing & Stock Reservation Schemas
const createReservationSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.number().int().positive(),
            quantity: z.number().int().positive(),
          })
          .strict()
      )
      .optional(),
  })
  .strict();

const releaseReservationSchema = z.object({}).strict().optional();

const basketOptimizerSchema = z
  .object({
    targetGap: z.coerce.number().min(0, 'targetGap must be a non-negative number').default(0),
    maxItems: z.coerce.number().int().positive().optional().default(5),
  })
  .strict();

// 6. Admin & Management Schemas
const adminCreateProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    qty_label: z.string().trim().min(1, 'qty_label is required'),
    price: z.number().min(0, 'price must be non-negative'),
    mrp: z.number().min(0).optional(),
    emoji: z.string().optional(),
    category_id: z.string().trim().min(1, 'category_id is required'),
    badge: z.string().optional().nullable(),
    image_url: z.string().optional().nullable(),
    stock: z.number().int().min(0).optional().default(50),
    reorder_level: z.number().int().min(0).optional().default(10),
    is_active: z.boolean().optional().default(true),
  })
  .strict();

const adminUpdateProductSchema = z.object({
  name: z.string().trim().min(1).optional(),
  qty_label: z.string().trim().min(1).optional(),
  price: z.number().min(0).optional(),
  mrp: z.number().min(0).optional(),
  emoji: z.string().optional(),
  category_id: z.string().trim().min(1).optional(),
  badge: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  stock: z.number().int().min(0).optional(),
  reorder_level: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const adminAdjustStockSchema = z
  .object({
    productId: z.number().int(),
    delta: z
      .number()
      .int()
      .refine((val) => val !== 0, 'Delta cannot be 0'),
    reason: z.string().max(255).optional(),
  })
  .strict();

const adminUpdateOrderStatusSchema = z
  .object({
    status: z.string().trim().min(1, 'Status is required'),
    note: z.string().max(500).optional(),
  })
  .strict();

const adminDispatchJobSchema = z
  .object({
    queueName: z.string().trim().min(1),
    jobName: z.string().trim().min(1),
    data: z.record(z.any()).optional(),
  })
  .strict();

// 7. Dispatch & Location Schemas
const driverLocationSchema = z
  .object({
    driverId: z.number().int().optional(),
    orderId: z.number().int().optional().nullable(),
    lat: z.number(),
    lng: z.number(),
    speedKmh: z.number().optional(),
  })
  .strict();

const verifyGeofenceSchema = z
  .object({
    driverLat: z.number(),
    driverLng: z.number(),
    maxDistanceMeters: z.number().positive().optional(),
  })
  .strict();

const assignDriverSchema = z
  .object({
    driverId: z.number().int().optional(),
  })
  .strict();

// 8. Inventory & Batch Schemas
const createBatchSchema = z
  .object({
    productId: z.number().int().positive(),
    batchNumber: z.string().trim().optional(),
    quantity: z.number().int().positive(),
    expiryDate: z.string().trim().min(1),
    costPrice: z.number().min(0).optional(),
  })
  .strict();

const allocateBatchSchema = z
  .object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })
  .strict();

const quarantineBatchSchema = z
  .object({
    batchId: z.number().int().optional(),
    reason: z.string().optional(),
  })
  .strict();

// 9. Pricing Schemas
const applyDynamicPriceSchema = z
  .object({
    demandRatio: z.number().optional(),
    actor: z.string().optional(),
  })
  .strict();

// 10. Security & Audit Schemas
const createAuditLogSchema = z
  .object({
    action: z.string().trim().min(1),
    targetType: z.string().trim().min(1),
    targetId: z.any().optional(),
    payload: z.any().optional(),
  })
  .strict();

const resolveFraudSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    notes: z.string().max(1000).optional(),
  })
  .strict();

// 11. Recommendations & A/B Tracking
const trackAbEventSchema = z
  .object({
    experiment: z.string().optional(),
    variant: z.string().optional(),
    eventType: z.string().optional(),
    productId: z.number().optional(),
    metadata: z.record(z.any()).optional(),
  })
  .strict();

// 12. Delivery Intelligence Schemas
const deliveryIntelRouteSchema = z
  .object({
    start: z.any(),
    target: z.any(),
    mode: z.string().optional(),
    algo: z.string().optional(),
  })
  .strict();

const deliveryIntelMatchSchema = z
  .object({
    orders: z.array(z.any()),
    riders: z.array(z.any()),
  })
  .strict();

const deliveryIntelBatchSchema = z
  .object({
    depot: z.any(),
    orders: z.array(z.any()),
    options: z.any().optional(),
  })
  .strict();

const deliveryIntelReserveSlotSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(23),
    count: z.number().int().positive().optional().default(1),
  })
  .strict();

const deliveryIntelETASchema = z
  .object({
    distanceKm: z.number().optional(),
    stopsCount: z.number().optional(),
    weather: z.string().optional(),
    trafficFactor: z.number().optional(),
  })
  .strict();

const deliveryIntelETAFeedbackSchema = z
  .object({
    predictedETA: z.number().optional(),
    actualDuration: z.number().optional(),
    features: z.any().optional(),
  })
  .strict();

const deliveryIntelCapacityConsumeSchema = z
  .object({
    demand: z.number().int().min(0).optional(),
  })
  .strict();

// 12. Address & OTP Schemas (P0)
const createAddressSchema = z
  .object({
    label: z.string().trim().max(50).optional().default('Home'),
    recipientName: z.string().trim().min(1, 'Recipient name is required').max(120),
    phone: z.string().trim().min(10, 'Valid 10-digit phone required').max(20),
    addressLine1: z.string().trim().min(3, 'Address line 1 is required').max(255),
    addressLine2: z.string().trim().max(255).optional().nullable(),
    landmark: z.string().trim().max(255).optional().nullable(),
    city: z.string().trim().max(100).optional().default('Hyderabad'),
    pincode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    isDefault: z.boolean().optional().default(false),
  })
  .strict();

const updateAddressSchema = z
  .object({
    label: z.string().trim().max(50).optional(),
    recipientName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(10).max(20).optional(),
    addressLine1: z.string().trim().min(3).max(255).optional(),
    addressLine2: z.string().trim().max(255).optional().nullable(),
    landmark: z.string().trim().max(255).optional().nullable(),
    city: z.string().trim().max(100).optional(),
    pincode: z
      .string()
      .trim()
      .regex(/^\d{6}$/)
      .optional(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    isDefault: z.boolean().optional(),
  })
  .strict();

const checkServiceabilitySchema = z
  .object({
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    pincode: z.string().trim().optional().nullable(),
  })
  .strict();

const sendOtpSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  })
  .strict();

const verifyOtpSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'OTP must be 6 digits'),
  })
  .strict();

module.exports = {
  registerSchema,
  loginSchema,
  mfaVerifySchema,
  addToCartSchema,
  updateCartItemSchema,
  applyCouponSchema,
  createOrderSchema,
  cancelOrderSchema,
  assistantChatSchema,
  assistantFeedbackSchema,
  recipeToCartSchema,
  createReservationSchema,
  releaseReservationSchema,
  basketOptimizerSchema,
  adminCreateProductSchema,
  adminUpdateProductSchema,
  adminAdjustStockSchema,
  adminUpdateOrderStatusSchema,
  adminDispatchJobSchema,
  driverLocationSchema,
  verifyGeofenceSchema,
  assignDriverSchema,
  createBatchSchema,
  allocateBatchSchema,
  quarantineBatchSchema,
  applyDynamicPriceSchema,
  createAuditLogSchema,
  resolveFraudSchema,
  trackAbEventSchema,
  deliveryIntelRouteSchema,
  deliveryIntelMatchSchema,
  deliveryIntelBatchSchema,
  deliveryIntelReserveSlotSchema,
  deliveryIntelETASchema,
  deliveryIntelETAFeedbackSchema,
  deliveryIntelCapacityConsumeSchema,
  createAddressSchema,
  updateAddressSchema,
  checkServiceabilitySchema,
  sendOtpSchema,
  verifyOtpSchema,
};
