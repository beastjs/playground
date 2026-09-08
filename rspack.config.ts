import { HtmlRspackPlugin, type Configuration } from "@rspack/core";
import { beastOctane } from "beast-tsrx/rspack";

const config: Configuration = {
  entry: "./src/main.ts",
  experiments: { css: true },
  module: { rules: [{ test: /\.css$/u, type: "css", use: ["postcss-loader"] }] },
  plugins: [new HtmlRspackPlugin({ template: "./index.html" }), beastOctane()],
  devServer: { historyApiFallback: true },
};

export default config;
