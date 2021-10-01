const AWS_APP_ID_MASTER = "abc123";
const AWS_APP_ID_DEVELOPMENT = "abcd1234";

function isAmplifyMasterApp() {
  return process.env.AWS_APP_ID === AWS_APP_ID_MASTER;
}

function isAmplifyDevelopmentApp() {
  return process.env.AWS_APP_ID === AWS_APP_ID_DEVELOPMENT;
}

function getAmplifyBackend() {
  if (!isAmplifyMasterApp() && !isAmplifyDevelopmentApp()) {
    throw new Error(
      "Building in Amplify but unknown application. Please add to the list of apps to help decide which env vars to use."
    );
  }
  const branch = process.env.AWS_BRANCH;

  const isAmplifyDevBackend = isAmplifyDevelopmentApp() && branch !== "master";
  const isAmplifyProductionBackend =
    isAmplifyMasterApp() && branch === "master";
  const isAmplifyStagingBackend =
    !isAmplifyDevBackend && !isAmplifyProductionBackend;
  if (isAmplifyDevBackend) {
    return "development";
  } else if (isAmplifyStagingBackend) {
    return "staging";
  } else if (isAmplifyProductionBackend) {
    return "production";
  } else {
    // This shouldn't be possible
    throw new Error("Unknown Amplify backend");
  }
}

function isPr() {
  const branch = process.env.AWS_BRANCH;
  return branch !== "master" && branch !== "develop";
}

function isRc() {
  return isPr() && process.env.AWS_APP_ID === AWS_APP_ID_MASTER;
}

module.exports = {
  AWS_APP_ID_MASTER,
  AWS_APP_ID_DEVELOPMENT,
  getAmplifyBackend,
  isPr,
  isRc,
};
