const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      lowercase: true,
      trim: true,
      index: true
    },
    otp: {
      type: String,
      required: [true, 'Please provide OTP code']
    },
    type: {
      type: String,
      enum: ['REGISTER', 'PASSWORD_RESET'],
      default: 'REGISTER',
      index: true
    },
    payload: {
      type: Object,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // Expire exactly at expiresAt date
    }
  },
  {
    timestamps: true
  }
);

// Compound index for fast lookup
otpSchema.index({ email: 1, type: 1, expiresAt: 1 });

module.exports = mongoose.model('Otp', otpSchema);
