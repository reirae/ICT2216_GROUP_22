const { AsyncLocalStorage } = require('async_hooks');

const requestContext = new AsyncLocalStorage();

function captureRequestContext(req, res, next) {
  requestContext.run({ ipAddress: req.ip || null }, next);
}

function getRequestIpAddress() {
  return requestContext.getStore()?.ipAddress || null;
}

module.exports = { captureRequestContext, getRequestIpAddress };
