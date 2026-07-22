import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const APP_URL = "https://bordo.abcensina.com.br/";
const QR_URL = `${APP_URL}qrcode/`;

test("a página do QR Code aponta diretamente para o app", async () => {
  const html = await readFile(new URL("../qrcode/index.html", import.meta.url), "utf8");

  assert.match(html, new RegExp(`<link rel="canonical" href="${QR_URL}"`));
  assert.match(html, /src="qr-bordo\.png"/);
  assert.match(html, /href="\.\.\/">Abrir o Bordo neste aparelho<\/a>/);
  assert.match(html, /sem rastreador ou redirecionador externo/);
});

test("oferece instalação do app no iPhone e Android", async () => {
  const [html, installScript] = await Promise.all([
    readFile(new URL("../qrcode/index.html", import.meta.url), "utf8"),
    readFile(new URL("../qrcode/install.js", import.meta.url), "utf8")
  ]);

  assert.match(html, /rel="manifest" href="\.\.\/manifest\.json"/);
  assert.match(html, /id="installApp"[^>]*>Baixar o app<\/button>/);
  assert.doesNotMatch(html, /download="qrcode-bordo\.png"/);
  assert.match(installScript, /beforeinstallprompt/);
  assert.match(installScript, /Adicionar à Tela de Início/);
  assert.match(installScript, /Instalar aplicativo/);
});

test("o sitemap e o Service Worker incluem a página do QR Code", async () => {
  const [sitemap, serviceWorker] = await Promise.all([
    readFile(new URL("../sitemap.xml", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8")
  ]);

  assert.match(sitemap, new RegExp(`<loc>${QR_URL}</loc>`));
  assert.match(serviceWorker, /"\.\/qrcode\/"/);
  assert.match(serviceWorker, /getNavigationCacheKey/);
});

test("o QR Code está salvo como um PNG quadrado", async () => {
  const png = await readFile(new URL("../qrcode/qr-bordo.png", import.meta.url));

  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, height);
  assert.ok(width >= 800);
});
