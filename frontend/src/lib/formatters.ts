/**
 * Clean text & enum formatters to eliminate raw underscores and format text professionally
 */

/**
 * Format system roles into clean, professional display titles
 * e.g., ORG_ADMIN -> Org Admin, PROJECT_MANAGER -> Project Manager, TEAM_LEAD -> Team Lead
 */
export const formatRole = (role?: string | null): string => {
  if (!role) return 'Member';

  const clean = String(role).trim().toUpperCase();

  switch (clean) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'ORG_ADMIN':
      return 'Org Admin';
    case 'PROJECT_MANAGER':
      return 'Project Manager';
    case 'TEAM_LEAD':
      return 'Team Lead';
    case 'DEVELOPER':
      return 'Developer';
    case 'QA':
      return 'QA Engineer';
    case 'CLOUD':
      return 'Cloud Engineer';
    case 'DESIGNER':
      return 'Designer';
    case 'PCB_DESIGNER':
      return 'PCB Designer';
    case 'HARDWARE':
      return 'Hardware Engineer';
    case 'FIRMWARE':
      return 'Firmware Engineer';
    case 'MEMBER':
      return 'Member';
    case 'GUEST':
      return 'Guest';
    case 'VIEWER':
      return 'Viewer';
    default:
      // Replace all underscores with spaces and title-case words
      return clean
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
};

/**
 * Replace all underscores with spaces and format enums/identifiers professionally
 * e.g., IN_PROGRESS -> In Progress, REQUEST_TO_WORK -> Request To Work
 */
export const formatEnum = (val?: string | null, titleCase = true): string => {
  if (!val) return '';
  const text = String(val).trim();
  if (!text.includes('_')) return text;

  if (titleCase) {
    return text
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return text.replace(/_/g, ' ');
};

/**
 * Format sprint statuses cleanly
 * e.g., ACTIVE -> Active, PLANNED -> Planned, COMPLETED -> Completed
 */
export const formatSprintStatus = (status?: string | null): string => {
  if (!status) return '';
  const clean = String(status).trim().toUpperCase();
  switch (clean) {
    case 'ACTIVE':
      return 'Active';
    case 'PLANNED':
      return 'Planned';
    case 'COMPLETED':
      return 'Completed';
    default:
      return clean
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
};

