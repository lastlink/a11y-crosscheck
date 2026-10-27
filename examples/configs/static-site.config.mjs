/**
 * The smallest useful config: a server-rendered or static site. No login, no client-side
 * rendering to wait out, one look. Everything left out takes its default (docs/wiring.md).
 */
export default {
  baseUrl: "http://localhost:8080",
  pages: ["/", "/pricing", "/contact", "/blog/"]
};
