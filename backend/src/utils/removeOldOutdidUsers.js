const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Invitation = require('../models/Invitation');

const removeOldOutdidUsers = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    console.log(`[RemoveOld] Connecting to MongoDB: ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    const emailsToDelete = [
      'sam@outdid.com',
      'kesav@outdid.com',
      'vivek@outdid.com',
      'poovarasan@outdid.com'
    ];

    // 1. Find user IDs before deleting
    const usersToDelete = await User.find({ email: { $in: emailsToDelete } });
    const userIdsToDelete = usersToDelete.map((u) => u._id);
    console.log(`[RemoveOld] Found ${usersToDelete.length} users to delete:`, usersToDelete.map((u) => u.email));

    // 2. Remove user IDs from workspace members
    if (userIdsToDelete.length > 0) {
      const updateResult = await Workspace.updateMany(
        {},
        {
          $pull: {
            members: { userId: { $in: userIdsToDelete } }
          }
        }
      );
      console.log(`[RemoveOld] Removed users from workspace members (modified: ${updateResult.modifiedCount})`);

      // 3. Delete users from User collection
      const deleteUserResult = await User.deleteMany({ _id: { $in: userIdsToDelete } });
      console.log(`[RemoveOld] Deleted ${deleteUserResult.deletedCount} users from users collection.`);
    }

    // 4. Delete pending invitations with @outdid.com
    const deleteInviteResult = await Invitation.deleteMany({
      email: { $in: ['keerthana@outdid.com', 'dhanush@outdid.com', 'arun@outdid.com'] }
    });
    console.log(`[RemoveOld] Deleted ${deleteInviteResult.deletedCount} pending invitations.`);

    // Also check for any remaining invitations for @outdid.com (excluding org)
    const extraInviteResult = await Invitation.deleteMany({
      email: /@outdid\.com$/i
    });
    if (extraInviteResult.deletedCount > 0) {
      console.log(`[RemoveOld] Deleted ${extraInviteResult.deletedCount} additional outdid invitations.`);
    }

    // 5. Verify org@outdid.com is intact
    const orgUser = await User.findOne({ email: 'org@outdid.com' });
    console.log('[RemoveOld] Verified org@outdid.com status:', orgUser ? `EXISTS (ID: ${orgUser._id})` : 'NOT FOUND');

    console.log('\n[RemoveOld] SUCCESS! Old users and invitations cleaned up.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[RemoveOld] Error:', err);
    process.exit(1);
  }
};

removeOldOutdidUsers();
