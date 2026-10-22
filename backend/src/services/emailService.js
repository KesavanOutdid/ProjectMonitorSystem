const transporter = require('../config/mailer');

class EmailService {
  /**
   * Send registration verification OTP code (Bypassed)
   */
  static async sendRegistrationOtp({ email, name, otp }) {
    console.log(`[Email Service (Bypassed)] Registration OTP for ${email}: ${otp}`);
    return { success: true, message: 'Email bypassed' };
  }

  /**
   * Send welcome & activation email (Bypassed)
   */
  static async sendWelcomeEmail(user) {
    console.log(`[Email Service (Bypassed)] Welcome email for ${user.email}`);
    return { success: true, message: 'Email bypassed' };
  }

  /**
   * Send project / workspace invitation email with direct link
   */
  static async sendInviteLink({ inviteeEmail, workspaceName, projectName, inviterName, inviteLink, role }) {
    console.log(`[Email Service (Bypassed)] Invite created for ${inviteeEmail}: ${inviteLink}`);
    return { success: true, message: 'Email bypassed' };
  }

  /**
   * Send task assignment email notification
   */
  static async sendTaskAssignedEmail(assignee, task, assigner) {
    console.log(`[Email Service (Bypassed)] Task assignment notification for ${assignee.email}`);
    return { success: true, message: 'Email bypassed' };
  }
}

module.exports = EmailService;
