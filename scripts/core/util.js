let offcache = new Array(2048);

export function getSearchOff(n) {
  if (offcache[n]) {
    return offcache[n];
  }

  console.log("Creating filter offsets of radius", n);

  let list = [];
  let wid = 2.0*n;

  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      if (i*i + j*j > n*n) {
        continue;
      }

      let w = Math.sqrt(i*i + j*j)/n;
      if (w === 0.0) {
        continue;
      }

      list.push([i, j, w]);
    }
  }

  offcache[n] = list;
  return list;
}

/* Create weights for simplified RGB value metric.*/
let w1 = 1, w2 = 0.8, w3 = 0.5;
let wtot = w1 + w2 + w3;
w1 /= wtot;
w2 /= wtot;
w3 /= wtot;

export function getColorValue(r, g, b) {
  return (r + g + b) *0.3333;
  return r*w1 + g*w2 + b*w3;
}

window.getSearchOff = getSearchOff;
