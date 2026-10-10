const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * expo-notifications adds the push entitlement (aps-environment) to every
 * build. Seam only schedules local reminders, which don't need it, and a free
 * (personal) Apple team can't sign apps that have it. Removing it lets the app
 * build with any team.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
