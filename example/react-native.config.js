const path = require('path');
const pkg = require('../package.json');

// scripts/measure-size.sh builds the demo once without the library's native code
// (RC_SIZE_BASELINE=1) to measure what the library adds to an app.
const baseline = process.env.RC_SIZE_BASELINE === '1';

module.exports = {
  project: {
    ios: {
      automaticPodsInstallation: true,
    },
  },
  dependencies: {
    [pkg.name]: {
      root: path.join(__dirname, '..'),
      platforms: baseline
        ? { ios: null, android: null }
        : {
            // Codegen script incorrectly fails without this
            // So we explicitly specify the platforms with empty object
            ios: {},
            android: {},
          },
    },
  },
};
