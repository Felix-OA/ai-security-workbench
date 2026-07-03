export function routeParts() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path] = hash.split("?");
  return path ? path.split("/") : [""];
}

export function routeQuery() {
  const hash = location.hash.replace(/^#\/?/, "");
  return new URLSearchParams(hash.split("?")[1] || "");
}

export function go(path) {
  location.hash = path;
}
