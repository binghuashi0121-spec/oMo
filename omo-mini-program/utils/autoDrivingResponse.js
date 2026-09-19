const RESPONSE_TIMEOUT_MS = 20000;

function responseKey(response) {
  if (!response || !response.messageNo) return '';
  return `${response.messageType || ''}|${response.messageNo}`;
}

function matchesPendingResponse(response, pending, handledKeys, now = Date.now()) {
  if (!response || !pending || !response.messageNo || !Number.isFinite(response.retCode)) return false;
  if (response.messageType !== pending.messageType) return false;
  const responseAt = Number(response.responseAt);
  if (!Number.isFinite(responseAt) || responseAt < pending.sentAt ||
      responseAt > now + 5000 || responseAt > pending.sentAt + RESPONSE_TIMEOUT_MS) return false;
  const key = responseKey(response);
  if (!key || handledKeys.has(key)) return false;
  if (pending.commandMessageNo && response.correlationMessageNo &&
      response.correlationMessageNo !== pending.commandMessageNo) return false;
  if (response.retCode === 0 && pending.stage === 'plan_wait' &&
      !(Number.isFinite(response.totalDistance) && response.totalDistance > 0)) return false;
  if (response.retCode === 0 && pending.stage === 'start_wait' &&
      Number.isFinite(response.totalDistance) && response.totalDistance > 0) return false;
  return true;
}

module.exports = { RESPONSE_TIMEOUT_MS, responseKey, matchesPendingResponse };
