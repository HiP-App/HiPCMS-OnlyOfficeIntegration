module.exports = {
  "extends": "airbnb-base",
  "installedESLint": true,
  "env": {
    "node": true
  },
  "plugins": [
    "import"
  ],
  "env": {
      "node": true
  },
  "rules": {
    "linebreak-style": [0],
    "space-before-function-paren": ["error", "always"],
    "strict": [0],
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
