/* global AFRAME, THREE */

// Stripped down to contain only sky functions from : https://github.com/feiss/aframe-environment-component

if (typeof AFRAME === 'undefined') {
    throw new Error('Component attempted to register before AFRAME was available.');
}

AFRAME.registerComponent('atmosphere', {

    schema: {
        skyType: {default: 'atmosphere', oneOf:['none', 'color', 'gradient', 'atmosphere']},
        skyColor: {default: '#1d7444', type: 'color'},
        horizonColor: {default: '#1d7444', type: 'color'},
        lightPosition: {type:'vec3', default: {x: 0, y: 1, z: -0.2}},
    },

    multiple: false,

    init: function () {
        // stage ground diameter (and sky radius)
        this.STAGE_SIZE = 200;

        // create sky
        this.sky = document.createElement('a-sky');
        this.sky.setAttribute('radius', this.STAGE_SIZE);
        this.sky.setAttribute('theta-length', 110);

        // stars are created when needed
        this.stars = null;

        this.el.appendChild(this.sky);
    },

    update: function (oldData) {
        var skyType = this.data.skyType;
        var sunPos = new THREE.Vector3(this.data.lightPosition.x, this.data.lightPosition.y, this.data.lightPosition.z);
        sunPos.normalize();

        if (skyType != oldData.skyType ||
            this.data.skyColor != oldData.skyColor ||
            this.data.horizonColor != oldData.horizonColor) {

            this.sky.removeAttribute('material');

            var mat = {};
            mat.shader = {'none': 'flat', 'color': 'flat', 'gradient': 'gradientshader', 'atmosphere': 'skyshader'}[skyType];
            if (this.stars) {
                this.stars.setAttribute('visible', skyType == 'atmosphere');
            }
            if (skyType == 'color') {
                mat.color = this.data.skyColor;
                mat.fog = false;
            }
            else if (skyType == 'gradient') {
                mat.topColor = this.data.skyColor;
                mat.bottomColor = this.data.horizonColor;
            }
            this.sky.setAttribute('material', mat);
        }

        if (skyType == 'atmosphere') {
            this.sky.setAttribute('material', {'sunPosition': sunPos});
            this.setStars((1 - Math.max(0, (sunPos.y + 0.08) * 8)) * 2000 );
        }

        this.sky.setAttribute('visible', skyType !== 'none');

    },

    // Custom Math.random() with seed. Given this.data.seed and x, it always returns the same "random" number
    random: function (x) {
        return parseFloat('0.' + Math.sin(this.data.seed * 9999 * x).toString().substr(7));
    },

    // initializes the BufferGeometry for the stars
    createStars: function() {
        var numStars = 2000;
        var geometry = new THREE.BufferGeometry();
        var positions = new Float32Array( numStars * 3 );
        var radius = this.STAGE_SIZE - 1;
        var v = new THREE.Vector3();
        for (var i = 0; i < positions.length; i += 3) {
            v.set(this.random(i + 23) - 0.5, this.random(i + 24), this.random(i + 25) - 0.5);
            v.normalize();
            v.multiplyScalar(radius);
            positions[i  ] = v.x;
            positions[i+1] = v.y;
            positions[i+2] = v.z;
        }
        geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0); // don't draw any yet
        var material = new THREE.PointsMaterial({size: 0.01, color: 0xCCCCCC, fog: false});
        this.stars.setObject3D('mesh', new THREE.Points(geometry, material));
    },

    // Sets the number of stars visible. Calls createStars() to initialize if needed.
    setStars: function (numStars) {
        if (!this.stars){
            this.stars = document.createElement('a-entity');
            this.stars.id= 'stars';
            this.createStars();
            this.el.appendChild(this.stars);
        }
        numStars = Math.floor(Math.min(2000, Math.max(0, numStars)));
        this.stars.getObject3D('mesh').geometry.setDrawRange(0, numStars);
    }

});

// atmosphere sky shader. From https://github.com/aframevr/aframe/blob/master/examples/test/shaders/shaders/sky.js
AFRAME.registerShader('skyshader', {
    schema: {
        luminance: { type: 'number', default: 1, min: 0, max: 2, is: 'uniform' },
        turbidity: { type: 'number', default: 2, min: 0, max: 20, is: 'uniform' },
        reileigh: { type: 'number', default: 1, min: 0, max: 4, is: 'uniform' },
        mieCoefficient: { type: 'number', default: 0.005, min: 0, max: 0.1, is: 'uniform' },
        mieDirectionalG: { type: 'number', default: 0.8, min: 0, max: 1, is: 'uniform' },
        sunPosition: { type: 'vec3', default: {x: 0, y: 0, z: -1}, is: 'uniform' },
        color: {type: 'color', default: '#fff'} //placeholder to remove warning
    },

    vertexShader: [
        'varying vec3 vWorldPosition;',
        'void main() {',
        'vec4 worldPosition = modelMatrix * vec4( position, 1.0 );',
        'vWorldPosition = worldPosition.xyz;',
        'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
    ].join('\n'),

    fragmentShader: [
        'uniform sampler2D skySampler;',
        'uniform vec3 sunPosition;',
        'varying vec3 vWorldPosition;',

        'vec3 cameraPos = vec3(0., 0., 0.);',

        'uniform float luminance;',
        'uniform float turbidity;',
        'uniform float reileigh;',
        'uniform float mieCoefficient;',
        'uniform float mieDirectionalG;',

        // constants for atmospheric scattering'
        'const float e = 2.71828182845904523536028747135266249775724709369995957;',
        'const float pi = 3.141592653589793238462643383279502884197169;',

        // refractive index of air
        'const float n = 1.0003;',
        // number of molecules per unit volume for air at'
        'const float N = 2.545E25;' ,
        // 288.15K and 1013mb (sea level -45 celsius)
        // depolatization factor for standard air
        'const float pn = 0.035;',
        // wavelength of used primaries, according to preetham
        'const vec3 lambda = vec3(680E-9, 550E-9, 450E-9);',

        // mie stuff
        // K coefficient for the primaries
        'const vec3 K = vec3(0.686, 0.678, 0.666);',
        'const float v = 4.0;',

        // optical length at zenith for molecules
        'const float rayleighZenithLength = 8.4E3;',
        'const float mieZenithLength = 1.25E3;',
        'const vec3 up = vec3(0.0, 1.0, 0.0);',

        'const float EE = 1000.0;',
        'const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;',
        // 66 arc seconds -> degrees, and the cosine of that

        // earth shadow hack'
        'const float cutoffAngle = pi/1.95;',
        'const float steepness = 1.5;',

        'vec3 totalRayleigh(vec3 lambda)',
        '{',
        'return (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn));',
        '}',

        // see http://blenderartists.org/forum/showthread.php?321110-Shaders-and-Skybox-madness
        // A simplied version of the total Rayleigh scattering to works on browsers that use ANGLE
        'vec3 simplifiedRayleigh()',
        '{',
        'return 0.0005 / vec3(94, 40, 18);',
        '}',

        'float rayleighPhase(float cosTheta)',
        '{   ',
        'return (3.0 / (16.0*pi)) * (1.0 + pow(cosTheta, 2.0));',
        '}',

        'vec3 totalMie(vec3 lambda, vec3 K, float T)',
        '{',
        'float c = (0.2 * T ) * 10E-18;',
        'return 0.434 * c * pi * pow((2.0 * pi) / lambda, vec3(v - 2.0)) * K;',
        '}',

        'float hgPhase(float cosTheta, float g)',
        '{',
        'return (1.0 / (4.0*pi)) * ((1.0 - pow(g, 2.0)) / pow(1.0 - 2.0*g*cosTheta + pow(g, 2.0), 1.5));',
        '}',

        'float sunIntensity(float zenithAngleCos)',
        '{',
        'return EE * max(0.0, 1.0 - exp(-((cutoffAngle - acos(zenithAngleCos))/steepness)));',
        '}',

        '// Filmic ToneMapping http://filmicgames.com/archives/75',
        'float A = 0.15;',
        'float B = 0.50;',
        'float C = 0.10;',
        'float D = 0.20;',
        'float E = 0.02;',
        'float F = 0.30;',
        'float W = 1000.0;',

        'vec3 Uncharted2Tonemap(vec3 x)',
        '{',
        'return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;',
        '}',

        'void main() ',
        '{',
        'float sunfade = 1.0-clamp(1.0-exp((sunPosition.y/450000.0)),0.0,1.0);',

        'float reileighCoefficient = reileigh - (1.0* (1.0-sunfade));',

        'vec3 sunDirection = normalize(sunPosition);',

        'float sunE = sunIntensity(dot(sunDirection, up));',

        // extinction (absorbtion + out scattering)
        // rayleigh coefficients

        'vec3 betaR = simplifiedRayleigh() * reileighCoefficient;',

        // mie coefficients
        'vec3 betaM = totalMie(lambda, K, turbidity) * mieCoefficient;',

        // optical length
        // cutoff angle at 90 to avoid singularity in next formula.
        'float zenithAngle = acos(max(0.0, dot(up, normalize(vWorldPosition - cameraPos))));',
        'float sR = rayleighZenithLength / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));',
        'float sM = mieZenithLength / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));',

        // combined extinction factor
        'vec3 Fex = exp(-(betaR * sR + betaM * sM));',

        // in scattering
        'float cosTheta = dot(normalize(vWorldPosition - cameraPos), sunDirection);',

        'float rPhase = rayleighPhase(cosTheta*0.5+0.5);',
        'vec3 betaRTheta = betaR * rPhase;',

        'float mPhase = hgPhase(cosTheta, mieDirectionalG);',
        'vec3 betaMTheta = betaM * mPhase;',

        'vec3 Lin = pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * (1.0 - Fex),vec3(1.5));',
        'Lin *= mix(vec3(1.0),pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * Fex,vec3(1.0/2.0)),clamp(pow(1.0-dot(up, sunDirection),5.0),0.0,1.0));',

        //nightsky
        'vec3 direction = normalize(vWorldPosition - cameraPos);',
        'float theta = acos(direction.y); // elevation --> y-axis, [-pi/2, pi/2]',
        'float phi = atan(direction.z, direction.x); // azimuth --> x-axis [-pi/2, pi/2]',
        'vec2 uv = vec2(phi, theta) / vec2(2.0*pi, pi) + vec2(0.5, 0.0);',
        // vec3 L0 = texture2D(skySampler, uv).rgb+0.1 * Fex;
        'vec3 L0 = vec3(0.1) * Fex;',

        // composition + solar disc
        'float sundisk = smoothstep(sunAngularDiameterCos,sunAngularDiameterCos+0.00002,cosTheta);',
        'L0 += (sunE * 19000.0 * Fex)*sundisk;',

        'vec3 whiteScale = 1.0/Uncharted2Tonemap(vec3(W));',

        'vec3 texColor = (Lin+L0);   ',
        'texColor *= 0.04 ;',
        'texColor += vec3(0.0,0.001,0.0025)*0.3;',

        'float g_fMaxLuminance = 1.0;',
        'float fLumScaled = 0.1 / luminance;     ',
        'float fLumCompressed = (fLumScaled * (1.0 + (fLumScaled / (g_fMaxLuminance * g_fMaxLuminance)))) / (1.0 + fLumScaled); ',

        'float ExposureBias = fLumCompressed;',

        'vec3 curr = Uncharted2Tonemap((log2(2.0/pow(luminance,4.0)))*texColor);',
        'vec3 color = curr*whiteScale;',

        'vec3 retColor = pow(color,vec3(1.0/(1.2+(1.2*sunfade))));',

        'gl_FragColor.rgb = retColor;',

        'gl_FragColor.a = 1.0;',
        '}'
    ].join('\n')
});

// gradient sky shader

AFRAME.registerShader('gradientshader', {
    schema: {
        topColor: {type: 'color', default: '1 0 0', is: 'uniform'},
        bottomColor: {type: 'color', default: '0 0 1', is: 'uniform'}
    },

    vertexShader: [
        'varying vec3 vWorldPosition;',
        'void main() {',
        ' vec4 worldPosition = modelMatrix * vec4( position, 1.0 );',
        ' vWorldPosition = worldPosition.xyz;',
        ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0 );',
        '}'
    ].join('\n'),

    fragmentShader: [
        'uniform vec3 bottomColor;',
        'uniform vec3 topColor;',
        'uniform float offset;',
        'varying vec3 vWorldPosition;',
        'void main() {',
        ' float h = normalize( vWorldPosition ).y;',
        ' gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max(h, 0.0 ), 0.8 ), 0.0 ) ), 1.0 );',
        '}'
    ].join('\n')
});
