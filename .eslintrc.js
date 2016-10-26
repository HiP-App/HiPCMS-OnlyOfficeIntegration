module.exports = {
    "extends": "airbnb",
    "installedESLint": true,
    "plugins": [
        "react",
        "jsx-a11y",
        "import"
    ],
    "rules": {
      "no-prototype-builtins": 0,
      "max-len": ["error", { "ignoreComments": true }]
    }
};
