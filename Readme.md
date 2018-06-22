# A-Frame Atmosphere Component

Stripped down to contain only atmospheric sky functions from : https://github.com/feiss/aframe-environment-component

## Usage

---
    <a-entity id="environment" atmosphere="lightPosition: 1 5 -2;">
    </a-entity>
---

## Publish package

### First publish

---
    npm publish --access public
---

### Update

---
    npm version patch
    npm publish
---