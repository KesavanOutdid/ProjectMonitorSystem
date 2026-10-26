/**
 * Generates an intelligent, human-readable mnemonic code for a task based on its title:
 * 
 * Scenario 1 (Multi-Word Title):
 * Uses first letter of each word (up to 3 words):
 * - "Admin Login" -> "AL"
 * - "User Profile Settings" -> "UPS"
 * - "Hardware Power Architecture" -> "HPA"
 * 
 * Scenario 2 (Single-Word Title):
 * Uses first 3 characters of the word:
 * - "Driver" -> "DRI"
 * - "Dashboard" -> "DAS"
 * - "UI" -> "UI"
 * 
 * Collision Handling:
 * If the generated code is already used in the same project/team, appends sequential numeric suffixes:
 * - 1st "Admin Login" -> "AL"
 * - 2nd "Admin Logout" -> "AL1"
 * - 3rd "Admin Loading" -> "AL2"
 * - 1st "Driver" -> "DRI"
 * - 2nd "Driner" -> "DRI1"
 * 
 * @param {string} title - Task title
 * @param {Set<string>|Array<string>} existingCodes - Set or array of already existing codes or full keys
 * @returns {string} The unique task code (e.g. "AL", "AL1", "DRI")
 */
function generateMnemonicTaskCode(title, existingCodes = new Set()) {
  const codesSet = existingCodes instanceof Set ? existingCodes : new Set(existingCodes);

  // Extract clean words (letters & digits only)
  const cleanTitle = (title || '').toString().trim();
  const words = cleanTitle.split(/[\s_\-]+/).filter(Boolean);

  let baseCode = '';

  if (words.length > 1) {
    // Multi-word: take first letter of each word (up to 3 letters)
    baseCode = words
      .slice(0, 3)
      .map((w) => {
        const cleanW = w.replace(/[^a-zA-Z0-9]/g, '');
        return cleanW.length > 0 ? cleanW[0].toUpperCase() : '';
      })
      .join('');
  } else if (words.length === 1) {
    // Single word: take first 3 alphanumeric characters
    const cleanWord = words[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    baseCode = cleanWord.slice(0, 3);
  }

  // Fallback if no valid letters were extracted
  if (!baseCode) {
    baseCode = 'TSK';
  }

  // Ensure uppercase
  baseCode = baseCode.toUpperCase();

  // Helper to check if a code (or full key ending in -code) is taken
  const isTaken = (code) => {
    if (codesSet.has(code)) return true;
    for (const item of codesSet) {
      if (typeof item === 'string') {
        const upper = item.toUpperCase().trim();
        if (upper === code) return true;
        // Check if item is a full key like PROJ-MT-SW-AL or PROJ-MT-SW-AL-1
        const parts = upper.split('-');
        if (parts.length >= 4 && parts[3] === code) return true;
      }
    }
    return false;
  };

  // If baseCode is not taken, use it directly!
  if (!isTaken(baseCode)) {
    codesSet.add(baseCode);
    return baseCode;
  }

  // Collision handling: append 1, 2, 3...
  let suffix = 1;
  while (isTaken(`${baseCode}${suffix}`)) {
    suffix++;
  }

  const finalCode = `${baseCode}${suffix}`;
  codesSet.add(finalCode);
  return finalCode;
}

function extractTaskMnemonic(key, fallback = '1') {
  if (!key) return String(fallback);
  const parts = String(key).split('-');
  if (parts.length >= 4) {
    return parts[3];
  }
  return String(fallback);
}

module.exports = {
  generateMnemonicTaskCode,
  extractTaskMnemonic
};

