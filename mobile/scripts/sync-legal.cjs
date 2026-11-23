// Extract the native offline copies from the same documents used on the website.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.join(__dirname, "../..");
const docs = {};
for (const slug of ["offer", "privacy", "consent"]) {
  const file = path.join(root, "app/legal", slug, "page.tsx");
  const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const blocks = [];
  function segments(children) {
    return children.flatMap(node => {
      if (ts.isJsxText(node)) return [{ text: node.text.replace(/\s+/g, " ") }];
      if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) return [{ text: node.expression.text }];
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "br") return [{ text: "\n" }];
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "Link") {
        const href = node.openingElement.attributes.properties.find(p => p.name?.getText() === "href")?.initializer?.text;
        if (!/^\/legal\/(offer|privacy|consent)$/.test(href)) throw Error("Unmapped document link: " + href);
        return [{ text: segments(node.children).map(part => part.text).join("").trim(), href }];
      }
      throw Error("Unsupported document markup: " + node.getText().slice(0, 60));
    });
  }
  function read(node) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText();
      if (["h1", "h2", "p", "li"].includes(tag)) {
        const parts = segments(node.children);
        if (parts.length) {
          parts[0].text = parts[0].text.trimStart();
          parts.at(-1).text = parts.at(-1).text.trimEnd();
          blocks.push({ tag, parts });
        }
        return;
      }
    }
    ts.forEachChild(node, read);
  }
  read(ast);
  if (blocks[0]?.tag !== "h1" || blocks.length < 5) throw Error("Incomplete legal document: " + slug);
  docs[slug] = blocks;
}
fs.writeFileSync(path.join(root, "mobile/lib/legal-documents.json"), JSON.stringify(docs, null, 2) + "\n");
