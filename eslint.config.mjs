import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "**/.venv/**",
      "coverage/**",
      "dist/**",
      "next-env.d.ts"
    ]
  },
  ...nextVitals,
  ...nextTypescript
];

export default eslintConfig;
