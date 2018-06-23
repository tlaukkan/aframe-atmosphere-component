# A-Frame Atmosphere Component

Stripped down to contain only atmospheric sky functions from : https://github.com/feiss/aframe-environment-component

## Usage

---
    <script src="https://unpkg.com/@tlaukkan/aframe-atmosphere-component@0.0.2/atmosphere.js"></script>

    ...

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