export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function resizeImage(image, w, h) {
  let canvas = document.createElement("canvas");
  let g = canvas.getContext("2d");
  canvas.width = image.width;
  canvas.height = image.height;

  /* Most likely image is an instnace of ImageData*/
  if (image instanceof ImageData) {
    g.putImageData(image, 0, 0);
  } else {
    g.drawImage(image, 0, 0);
  }

  let canvas2 = document.createElement("canvas");
  let g2 = canvas2.getContext("2d");
  canvas2.width = w;
  canvas2.height = h;

  g2.drawImage(canvas, 0, 0, w, h);
  return g2.getImageData(0, 0, canvas2.width, canvas2.height);
}

/** Takes an ImageData or other image source and returns an ImageData. */
export function applyImageFilter(image, filterString) {
  let canvas = document.createElement("canvas");
  let g = canvas.getContext("2d");
  canvas.width = image.width;
  canvas.height = image.height;

  /* Most likely image is an instnace of ImageData*/
  if (image instanceof ImageData) {
    g.putImageData(image, 0, 0);
  } else {
    g.drawImage(image, 0, 0);
  }

  /* Have to use another canvas due to putImageData. */

  let canvas2 = document.createElement("canvas");
  let g2 = canvas2.getContext("2d");
  canvas2.width = image.width;
  canvas2.height = image.height;

  g2.filter = filterString;

  g2.drawImage(canvas, 0, 0);

  return g2.getImageData(0, 0, image.width, image.height);
}

export function sharpenImage(image, factor) {
  let canvas = document.createElement("canvas");
  let g = canvas.getContext("2d");
  canvas.width = image.width;
  canvas.height = image.height;

  const SVG = SVG_NAMESPACE;
  let svg = document.createElementNS(SVG, "svg");

  factor = 1.0 - factor;
  let a = 10;
  let b = 0;
  let c = (a + b)*(4.01 + factor);
  a = -a;
  b = -b;
  let matrixData = `
     b   a   b
     a   c   a
     b   a   b`
    .replace(/a/g, ""+a)
    .replace(/b/g, ""+b)
    .replace(/c/g, ""+c)
    .trim();

  let filter = document.createElementNS(SVG, "filter");
  let matrix = document.createElementNS(SVG, "feConvolveMatrix");
  matrix.setAttributeNS(SVG, "order", "3");
  matrix.setAttributeNS(SVG, "kernelMatrix", matrixData);

  filter.appendChild(matrix);
  filter.setAttributeNS(SVG, "id", "filter1");
  svg.appendChild(filter);

  svg.setAttribute("xmlns", SVG);

  let xmlfile = `
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
${svg.outerHTML}
  `.trim();

  /* Note: Blob's doesn't work here, have to use data URLs.*/
  let url = 'data:image/svg+xml;base64,' + btoa(xmlfile);
  return applyImageFilter(image, `url(${url}#filter1)`);
}
