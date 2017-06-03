module.exports = {
  "extends": "airbnb",
  "installedESLint": true,
  "env": {
    "node": true
  },
  "plugins": [
    "react",
    "jsx-a11y",
    "import"
  ],
  "rules": {
    "comma-dangle": ["error", "never"],
    "indent": ["error", 2],
    "no-prototype-builtins": 0,
    "max-len": [1, {
      "ignoreComments": true,
      "ignoreTemplateLiterals": true
    }],
    "no-plusplus": ["error", {
      "allowForLoopAfterthoughts": true
    }],
    "strict": 0
  }
};
