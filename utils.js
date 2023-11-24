/**
 * @param {string} str
 * @returns
 */
export function stringToSeconds(str) {
  const [h, m, s] = str.split(":");

  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);
}

/**
 * @param {string} str
 */
export function parseCourseLength(str) {
  const km = parseFloat(str.replace(",", "."));

  return (km * 1000).toString();
}
