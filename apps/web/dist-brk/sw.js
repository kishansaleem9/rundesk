/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-71d9b3b4'], (function (workbox) { 'use strict';

  self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });

  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "favicon.svg",
    "revision": "2fecc03ed1ff700581a6344c1bc9c7ee"
  }, {
    "url": "icons/icon.svg",
    "revision": "4dd4a41b1a48a01fc5c128b58eaee9aa"
  }, {
    "url": "favicon.svg",
    "revision": "2fecc03ed1ff700581a6344c1bc9c7ee"
  }, {
    "url": "icons/icon.svg",
    "revision": "4dd4a41b1a48a01fc5c128b58eaee9aa"
  }, {
    "url": "manifest.webmanifest",
    "revision": "4a66f2d8d816e6b74a1d93b1b5def275"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(({
    url
  }) => url.pathname.startsWith("/assets/"), new workbox.CacheFirst({
    "cacheName": "rundesk-assets",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 300,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(({
    request
  }) => request.mode === "navigate", new workbox.NetworkFirst({
    "cacheName": "rundesk-html",
    "networkTimeoutSeconds": 3,
    plugins: []
  }), 'GET');
  workbox.registerRoute(({
    url,
    request
  }) => url.pathname.startsWith("/api/v1") && request.method === "GET", new workbox.NetworkFirst({
    "cacheName": "rundesk-api",
    "networkTimeoutSeconds": 5,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 200,
      maxAgeSeconds: 86400
    })]
  }), 'GET');

}));
