const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Required for @supabase/supabase-js and its sub-packages
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ["browser", "require", "default"];

module.exports = config;
