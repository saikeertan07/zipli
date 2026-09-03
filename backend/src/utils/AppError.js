// A predictable, "operational" error we can throw anywhere in the app.
// The centralized error handler knows how to translate this into a
// clean JSON response with the right HTTP status code and error envelope.
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
