import * as pc from 'playcanvas';
import Ammo from 'sync-ammo/dist/ammo.module.js';

globalThis.Ammo = Ammo;

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const boot = $('boot');
const bootStatus = $('bootStatus');
const bootProgress = $('bootProgress');
const bootError = $('bootError');
const startOverlay = $('start');
const hud = $('hud');
const sectorEl = $('sector');
const statusEl = $('status');
const perfEl = $('perf');
const toastEl = $('toast');
const hitmarker = $('hitmarker');

let fatal = false;
function setBoot(text, progress) {
    bootStatus.textContent = text;
    bootProgress.style.width = Math.max(4, Math.min(100, progress)) + '%';
}
function showFatal(error) {
    if (fatal) return;
    fatal = true;
    const message = error && (error.stack || error.message) ? (error.stack || error.message) : String(error);
    boot.classList.remove('hidden');
    bootStatus.textContent = 'RIGYARD no pudo iniciar';
    bootError.style.display = 'block';
    bootError.textContent = message;
    console.warn('[RIGYARD fatal]', message);
}
window.addEventListener('error', (e) => showFatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));

setBoot('Inicializando PlayCanvas y Bullet…', 8);

const keyboard = new pc.Keyboard(window);
const mouse = new pc.Mouse(canvas);
const app = new pc.Application(canvas, {
    keyboard,
    mouse,
    graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    }
});

if (!app.systems.rigidbody.physicsWorld) {
    app.systems.rigidbody.setPhysicsWorld(new pc.AmmoPhysicsWorld());
}
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(0.22, 0.28, 0.31);
app.scene.gammaCorrection = pc.GAMMA_SRGB;
app.scene.toneMapping = pc.TONEMAP_ACES2;
app.scene.exposure = 1.05;
app.scene.fog.type = pc.FOG_LINEAR;
app.scene.fog.color = new pc.Color(0.19, 0.25, 0.27);
app.scene.fog.start = 60;
app.scene.fog.end = 155;
app.systems.rigidbody.gravity.set(0, -17, 0);

window.addEventListener('resize', () => app.resizeCanvas());

const state = {
    playing: false,
    thirdPerson: false,
    tool: 0,
    yaw: 0,
    pitch: -5,
    held: null,
    heldDistance: 5,
    weldFirst: null,
    quality: 2,
    keys: new Set(),
    jumpQueued: false,
    crouch: false,
    avatarModel: 0,
    build: 1,
    height: 1,
    shirt: new pc.Color(0.18, 0.42, 0.52),
    elapsed: 0
};

const dynamicProps = [];
const npcs = [];
const welds = [];
const textureCache = new Map();
const materials = {};
const tmp = {
    a: new pc.Vec3(),
    b: new pc.Vec3(),
    c: new pc.Vec3(),
    d: new pc.Vec3()
};

function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toastEl.classList.remove('on'), 1400);
}
function markHit() {
    hitmarker.classList.add('on');
    clearTimeout(markHit._timer);
    markHit._timer = setTimeout(() => hitmarker.classList.remove('on'), 100);
}
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}
function cssColor(c) {
    return 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')';
}

function makePatternTexture(kind, base, accent) {
    const key = kind + ':' + base + ':' + accent;
    if (textureCache.has(key)) return textureCache.get(key);
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    let seed = 7819301 + kind.length * 179;
    const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    if (kind === 'concrete' || kind === 'darkConcrete') {
        for (let i = 0; i < 5000; i++) {
            const g = Math.floor(80 + rnd() * 80);
            ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',' + (0.015 + rnd() * 0.04) + ')';
            const s = 1 + rnd() * 2;
            ctx.fillRect(rnd() * size, rnd() * size, s, s);
        }
        ctx.strokeStyle = 'rgba(0,0,0,.08)';
        ctx.lineWidth = 1;
        for (let y = 32; y < size; y += 64) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y + rnd() * 3 - 1.5);
            ctx.stroke();
        }
    } else if (kind === 'metal') {
        const grad = ctx.createLinearGradient(0, 0, size, 0);
        grad.addColorStop(0, base);
        grad.addColorStop(.5, accent);
        grad.addColorStop(1, base);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(255,255,255,.08)';
        for (let x = 0; x < size; x += 5) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
        }
        for (let i = 0; i < 70; i++) {
            ctx.strokeStyle = 'rgba(75,35,14,' + (0.05 + rnd() * .18) + ')';
            ctx.beginPath();
            ctx.moveTo(rnd() * size, rnd() * size);
            ctx.lineTo(rnd() * size, rnd() * size);
            ctx.stroke();
        }
    } else if (kind === 'grass') {
        for (let i = 0; i < 2500; i++) {
            const a = .04 + rnd() * .15;
            ctx.strokeStyle = rnd() > .5 ? 'rgba(170,190,120,' + a + ')' : 'rgba(10,45,28,' + a + ')';
            const x = rnd() * size, y = rnd() * size;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 2 - 1, y - 2 - rnd() * 5); ctx.stroke();
        }
    } else if (kind === 'wood') {
        for (let y = 0; y < size; y += 32) {
            ctx.fillStyle = y % 64 === 0 ? base : accent;
            ctx.fillRect(0, y, size, 30);
            ctx.fillStyle = 'rgba(0,0,0,.16)';
            ctx.fillRect(0, y + 29, size, 3);
        }
        for (let i = 0; i < 45; i++) {
            ctx.strokeStyle = 'rgba(70,28,8,.13)';
            ctx.beginPath();
            const y = rnd() * size;
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(70, y + rnd() * 12 - 6, 170, y + rnd() * 12 - 6, 256, y);
            ctx.stroke();
        }
    } else if (kind === 'tile') {
        ctx.strokeStyle = 'rgba(20,25,27,.34)';
        ctx.lineWidth = 2;
        for (let x = 0; x <= size; x += 32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,size); ctx.stroke(); }
        for (let y = 0; y <= size; y += 32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(size,y); ctx.stroke(); }
    } else if (kind === 'hazard') {
        ctx.fillStyle = '#d29b19';
        ctx.fillRect(0,0,size,size);
        ctx.save();
        ctx.translate(-80,0);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#15191b';
        for (let x = -size; x < size * 2; x += 52) ctx.fillRect(x, -size, 25, size * 3);
        ctx.restore();
    }

    const texture = new pc.Texture(app.graphicsDevice, {
        width: size,
        height: size,
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: true,
        addressU: pc.ADDRESS_REPEAT,
        addressV: pc.ADDRESS_REPEAT
    });
    texture.setSource(cv);
    textureCache.set(key, texture);
    return texture;
}

function mat(name, opts) {
    const m = new pc.StandardMaterial();
    m.name = name;
    m.diffuse = opts.color || new pc.Color(1, 1, 1);
    m.metalness = opts.metalness || 0;
    m.useMetalness = true;
    m.gloss = opts.gloss === undefined ? .35 : opts.gloss;
    if (opts.kind) {
        m.diffuseMap = makePatternTexture(opts.kind, opts.base, opts.accent || opts.base);
        m.diffuseMapTiling = new pc.Vec2(opts.tile || 4, opts.tile || 4);
    }
    if (opts.emissive) {
        m.emissive = opts.emissive;
        m.emissiveIntensity = opts.emissiveIntensity || 1;
    }
    if (opts.opacity !== undefined) {
        m.opacity = opts.opacity;
        m.blendType = pc.BLEND_NORMAL;
        m.depthWrite = opts.opacity >= .95;
    }
    m.update();
    materials[name] = m;
    return m;
}

setBoot('Generando materiales PBR…', 18);

mat('concrete', { kind:'concrete', base:'#747c7e', accent:'#8b9292', color:new pc.Color(.72,.75,.74), gloss:.2, tile:5 });
mat('darkConcrete', { kind:'darkConcrete', base:'#283237', accent:'#39454a', color:new pc.Color(.48,.51,.51), gloss:.18, tile:5 });
mat('plaster', { kind:'concrete', base:'#d0d2ca', accent:'#b9bdb8', color:new pc.Color(.92,.92,.87), gloss:.2, tile:4 });
mat('metal', { kind:'metal', base:'#3a474c', accent:'#657278', color:new pc.Color(.68,.72,.72), metalness:.72, gloss:.55, tile:3 });
mat('grass', { kind:'grass', base:'#304a31', accent:'#506845', color:new pc.Color(.62,.72,.56), gloss:.12, tile:7 });
mat('wood', { kind:'wood', base:'#7a4826', accent:'#925b31', color:new pc.Color(.85,.67,.48), gloss:.18, tile:3 });
mat('tile', { kind:'tile', base:'#a8adab', accent:'#d0d3cf', color:new pc.Color(.88,.9,.88), gloss:.42, tile:4 });
mat('hazard', { kind:'hazard', base:'#cf9417', accent:'#171a1c', color:new pc.Color(1,1,1), gloss:.28, tile:3 });
mat('rubber', { color:new pc.Color(.055,.065,.07), gloss:.18 });
mat('orange', { color:new pc.Color(.92,.33,.08), metalness:.18, gloss:.45 });
mat('cyan', { color:new pc.Color(.08,.48,.58), metalness:.24, gloss:.5, emissive:new pc.Color(0,.22,.35), emissiveIntensity:.45 });
mat('skin', { color:new pc.Color(.66,.42,.30), gloss:.25 });
mat('cloth', { color:state.shirt, gloss:.12 });
mat('water', { color:new pc.Color(.08,.26,.31), gloss:.82, opacity:.68 });

function applyMaterial(entity, material) {
    if (!entity.render) return;
    for (const mi of entity.render.meshInstances) mi.material = material;
}
function box(name, pos, scale, material, solid = true, options = {}) {
    const e = new pc.Entity(name);
    e.setPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    e.addComponent('render', {
        type: 'box',
        castShadows: options.castShadows !== false,
        receiveShadows: options.receiveShadows !== false
    });
    applyMaterial(e, material);
    if (solid) {
        e.addComponent('collision', {
            type: 'box',
            halfExtents: new pc.Vec3(scale[0] * .5, scale[1] * .5, scale[2] * .5)
        });
        e.addComponent('rigidbody', { type: 'static', friction: .8, restitution: 0 });
    }
    app.root.addChild(e);
    return e;
}
function cylinder(name, pos, scale, material, solid = false) {
    const e = new pc.Entity(name);
    e.setPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    e.addComponent('render', { type:'cylinder', castShadows:true, receiveShadows:true });
    applyMaterial(e, material);
    if (solid) {
        e.addComponent('collision', { type:'cylinder', radius:scale[0] * .5, height:scale[1] });
        e.addComponent('rigidbody', { type:'static', friction:.7 });
    }
    app.root.addChild(e);
    return e;
}

function dynamicBox(kind, pos, size, mass, material) {
    const e = new pc.Entity(kind);
    e.setPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(size[0], size[1], size[2]);
    e.addComponent('render', { type:'box', castShadows:true, receiveShadows:true });
    applyMaterial(e, material);
    e.addComponent('collision', { type:'box', halfExtents:new pc.Vec3(size[0]*.5,size[1]*.5,size[2]*.5) });
    e.addComponent('rigidbody', {
        type:'dynamic',
        mass,
        friction:.65,
        restitution:.08,
        linearDamping:.13,
        angularDamping:.18
    });
    e.userData = { kind, spawn:new pc.Vec3(pos[0],pos[1],pos[2]) };
    app.root.addChild(e);
    dynamicProps.push(e);
    return e;
}
function dynamicSphere(kind, pos, radius, mass, material) {
    const e = new pc.Entity(kind);
    e.setPosition(pos[0],pos[1],pos[2]);
    e.setLocalScale(radius*2,radius*2,radius*2);
    e.addComponent('render', { type:'sphere', castShadows:true, receiveShadows:true });
    applyMaterial(e, material);
    e.addComponent('collision', { type:'sphere', radius });
    e.addComponent('rigidbody', { type:'dynamic', mass, friction:.55, restitution:.48, linearDamping:.06, angularDamping:.05 });
    e.userData = { kind, spawn:new pc.Vec3(pos[0],pos[1],pos[2]) };
    app.root.addChild(e);
    dynamicProps.push(e);
    return e;
}

function light(name, type, pos, color, intensity, range, castShadows = false) {
    const e = new pc.Entity(name);
    e.setPosition(pos[0],pos[1],pos[2]);
    e.addComponent('light', {
        type,
        color,
        intensity,
        range,
        castShadows,
        shadowResolution: 1024,
        shadowBias: .2
    });
    app.root.addChild(e);
    return e;
}

setBoot('Construyendo RIGYARD…', 28);

const sun = light('Sun','directional',[0,34,0],new pc.Color(1,.83,.68),1.45,100,true);
sun.setEulerAngles(52,-38,0);
light('Cold fill','directional',[0,20,0],new pc.Color(.32,.52,.65),.45,100,false).setEulerAngles(38,145,0);

box('Main ground',[0,-.6,-9],[116,1.2,104],materials.concrete,true,{castShadows:false});
box('Grass field',[-27,.06,-17],[40,.18,36],materials.grass,true,{castShadows:false});
box('Spawn pad',[0,.05,9],[23,.18,21],materials.darkConcrete,true,{castShadows:false});

for (const x of [-56,56]) box('Perimeter wall',[x,3.5,-9],[1.1,8,104],materials.darkConcrete);
box('North perimeter',[0,3.5,-60],[112,8,1.1],materials.darkConcrete);
box('South perimeter',[0,3.5,42],[112,8,1.1],materials.darkConcrete);

box('White room floor',[-34,.15,18],[27,.3,22],materials.tile);
box('White west',[-47.2,5,18],[.55,10,22],materials.plaster);
box('White north',[-34,5,7.2],[27,10,.55],materials.plaster);
box('White south',[-34,5,28.8],[27,10,.55],materials.plaster);
box('White divider',[-30,5,18],[.5,10,14],materials.plaster);
for (let x=-44; x<-22; x+=6) light('White ceiling','omni',[x,8.4,18],new pc.Color(.76,.86,1),1.2,12,false);

box('Dark room floor',[12,.15,-37],[31,.3,22],materials.darkConcrete);
box('Dark north',[12,4.5,-48],[31,9,.7],materials.darkConcrete);
box('Dark south',[12,4.5,-26],[31,9,.7],materials.darkConcrete);
box('Dark east',[27,4.5,-37],[.7,9,22],materials.darkConcrete);
box('Dark west',[-3,4.5,-37],[.7,9,22],materials.darkConcrete);
for (let z=-43; z<-29; z+=7) light('Dark strip','omni',[11,6.8,z],new pc.Color(.12,.42,.54),1.1,10,false);

box('Hangar floor',[30,.12,15],[42,.24,28],materials.concrete);
box('Hangar east',[50.5,6,15],[1,12,28],materials.metal);
box('Hangar north',[30,6,1.3],[42,12,.8],materials.metal);
box('Hangar south',[30,6,28.7],[42,12,.8],materials.metal);
for (let x=12;x<50;x+=9) {
    box('Hangar roof beam',[x,11.6,15],[.8,.65,28],materials.metal);
    cylinder('Hangar pipe',[x,8.6,3.2],[.28,23,.28],materials.metal,false).setEulerAngles(90,0,0);
}
for (let z=5;z<27;z+=7) light('Hangar lamp','omni',[30,9.8,z],new pc.Color(1,.69,.4),1.45,13,false);

box('Tower base',[35,.25,-31],[15,.5,14],materials.concrete);
for (const x of [28,42]) box('Tower side',[x,10,-31],[.7,20,14],materials.darkConcrete);
box('Tower back',[35,10,-37.7],[15,20,.7],materials.darkConcrete);
for (const y of [3.2,7.2,11.2,15.2,19.2]) {
    box('Tower floor',[35,y,-31],[14,.38,13],materials.concrete);
    box('Tower edge',[35,y+1.05,-24.7],[14,.18,.18],materials.hazard,false);
}
box('Tower front left',[30,10,-24.6],[3.2,20,.7],materials.darkConcrete);
box('Tower front right',[40,10,-24.6],[3.2,20,.7],materials.darkConcrete);
for (let i=0;i<4;i++) {
    const y=1.65+i*4;
    const z=i%2===0?-33.5:-28.5;
    const ramp=box('Tower ramp',[35,y+1.4,z],[10,.35,3.1],materials.metal);
    ramp.setEulerAngles(0,0,i%2===0?-18:18);
}

box('Tunnel floor',[-14,.05,-48],[30,.2,11],materials.darkConcrete);
box('Tunnel wall A',[-14,3.2,-53.3],[30,6.4,.5],materials.concrete);
box('Tunnel wall B',[-14,3.2,-42.7],[30,6.4,.5],materials.concrete);
box('Tunnel roof',[-14,6.2,-48],[30,.5,11],materials.concrete);
for (let x=-26;x<-1;x+=6) light('Tunnel lamp','omni',[x,5.4,-48],new pc.Color(.85,.92,1),.95,8,false);

box('Basin bottom',[3,-2.2,-4],[23,.35,17],materials.darkConcrete);
box('Basin wall N',[3,-.6,-12.3],[23,3.6,.6],materials.concrete);
box('Basin wall S',[3,-.6,4.3],[23,3.6,.6],materials.concrete);
box('Basin wall W',[-8.3,-.6,-4],[.6,3.6,17],materials.concrete);
box('Water',[3,-.7,-4],[22,.08,16],materials.water,false,{castShadows:false});
const basinRamp=box('Basin ramp',[-4.2,-.7,4.8],[8,.45,7],materials.concrete);
basinRamp.setEulerAngles(-14,0,0);

box('Catwalk',[-9,5,-9],[26,.4,2.2],materials.metal);
for (let x=-21;x<4;x+=3) {
    box('Catwalk rail',[x,6,-10],[.1,1.8,.12],materials.metal,false);
    box('Catwalk rail 2',[x,6,-8],[.1,1.8,.12],materials.metal,false);
}
box('Cat rail A',[-9,6,-10],[26,.12,.12],materials.metal,false);
box('Cat rail B',[-9,6,-8],[26,.12,.12],materials.metal,false);

for (let i=0;i<8;i++) {
    cylinder('Pipe',[19+i*.8,1.4,-12],[.25,7,.25],materials.metal,false).setEulerAngles(90,0,0);
}
box('Hazard stripe',[0,.18,19],[22,.08,.8],materials.hazard,false);
box('Hazard stripe 2',[41,.18,0.7],[18,.08,.8],materials.hazard,false);

const doorFrame = box('Door frame',[18,2.7,28],[8,.6,.8],materials.metal);
box('Door post A',[14.2,2.5,28],[.6,5,.8],materials.metal);
box('Door post B',[21.8,2.5,28],[.6,5,.8],materials.metal);
const door = dynamicBox('door',[17.7,2.2,28],[6.7,4.3,.35],42,materials.metal);
const hinge = new pc.Entity('Door hinge');
hinge.setPosition(14.5,2.2,28);
hinge.setEulerAngles(0,0,90);
hinge.addComponent('joint', {
    type: 'hinge',
    entityA: door,
    entityB: doorFrame,
    enableLimits: true,
    limits: new pc.Vec2(0,105),
    enableCollision: false
});
app.root.addChild(hinge);

dynamicBox('crate',[-4,1.1,10],[1.6,1.6,1.6],12,materials.wood);
dynamicBox('crate',[-1.8,1.1,10],[1.6,1.6,1.6],12,materials.wood);
dynamicBox('barrel',[2,1.2,10],[1.1,2,1.1],22,materials.metal);
dynamicBox('beam',[4,1.0,10],[3.8,.55,.55],30,materials.metal);
dynamicSphere('ball',[7,1.4,10],.9,9,materials.orange);
dynamicBox('pallet',[9,1,7],[2.4,.35,1.7],18,materials.wood);

setBoot('Creando jugador y cámara…', 48);

const player = new pc.Entity('Player');
player.userData = {};
player.setPosition(0,1.15,17);
player.addComponent('collision', { type:'capsule', radius:.42, height:1.8 });
player.addComponent('rigidbody', {
    type:'dynamic',
    mass:78,
    friction:.25,
    restitution:0,
    linearDamping:.04,
    angularDamping:1,
    linearFactor:new pc.Vec3(1,1,1),
    angularFactor:new pc.Vec3(0,0,0)
});
app.root.addChild(player);

const camera = new pc.Entity('Camera');
camera.addComponent('camera', {
    clearColor:new pc.Color(.13,.19,.22),
    fov:78,
    nearClip:.05,
    farClip:220
});
app.root.addChild(camera);

function makeHumanoid(name, shirtMaterial) {
    const root = new pc.Entity(name);
    const part = (partName, pos, scale, material, type='box') => {
        const e = new pc.Entity(partName);
        e.setLocalPosition(pos[0],pos[1],pos[2]);
        e.setLocalScale(scale[0],scale[1],scale[2]);
        e.addComponent('render', { type, castShadows:true, receiveShadows:true });
        applyMaterial(e,material);
        root.addChild(e);
        return e;
    };
    part('torso',[0,.1,0],[.68,.92,.34],shirtMaterial);
    part('head',[0,.86,0],[.42,.42,.42],materials.skin,'sphere');
    part('legL',[-.19,-.75,0],[.22,.72,.25],materials.rubber);
    part('legR',[.19,-.75,0],[.22,.72,.25],materials.rubber);
    part('armL',[-.48,.06,0],[.18,.74,.2],shirtMaterial);
    part('armR',[.48,.06,0],[.18,.74,.2],shirtMaterial);
    return root;
}
const playerFallback = makeHumanoid('Player fallback',materials.cloth);
playerFallback.setLocalPosition(0,-.05,0);
player.addChild(playerFallback);

const modelUrls = [
    '/models/field-explorer.glb',
    '/models/field-explorer-woman.glb',
    '/models/city-explorer.glb',
    '/models/city-worker-woman.glb',
    '/models/civic-responder.glb',
    '/models/ship-crew.glb'
];

function loadContainer(url) {
    return new Promise((resolve,reject) => {
        const asset = new pc.Asset(url.split('/').pop(),'container',{url});
        asset.on('load', () => resolve(asset));
        asset.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))));
        app.assets.add(asset);
        app.assets.load(asset);
    });
}
function attachContainerVisual(host, asset, fallback, targetHeight=1.75) {
    const visual = asset.resource.instantiateRenderEntity({ castShadows:true });
    const scale = targetHeight / 1.78;
    visual.setLocalScale(scale,scale,scale);
    visual.setLocalEulerAngles(0,180,0);
    visual.setLocalPosition(0,-.95,0);
    host.addChild(visual);
    if (fallback) fallback.enabled = false;
    if (asset.resource.animations && asset.resource.animations.length) {
        try {
            visual.addComponent('anim',{activate:true});
            const tracks = asset.resource.animations;
            const pick = (rx) => tracks.find(a => rx.test(String(a.resource && a.resource.name || a.name || '')));
            const idle = pick(/idle/i) || tracks[0];
            const walk = pick(/walk/i) || pick(/run/i) || idle;
            const run = pick(/run/i) || walk;
            visual.anim.assignAnimation('Idle', idle.resource);
            visual.anim.assignAnimation('Walk', walk.resource);
            visual.anim.assignAnimation('Run', run.resource);
            visual.anim.baseLayer.transition('Idle',0);
            host.userData.animVisual = visual;
        } catch {}
    }
    host.userData.modelVisual = visual;
    return visual;
}

const playerModelPromise = loadContainer(modelUrls[0]).then(asset => attachContainerVisual(player,asset,playerFallback,1.76)).catch(() => null);

function spawnNpc(pos, modelIndex=2) {
    const n = new pc.Entity('NPC');
    n.setPosition(pos[0],pos[1],pos[2]);
    n.addComponent('collision',{type:'capsule',radius:.38,height:1.75});
    n.addComponent('rigidbody',{
        type:'dynamic',
        mass:68,
        friction:.35,
        restitution:0,
        linearDamping:.12,
        angularDamping:1,
        angularFactor:new pc.Vec3(0,0,0)
    });
    n.userData = {
        hp:100,
        origin:new pc.Vec3(pos[0],pos[1],pos[2]),
        phase:Math.random()*Math.PI*2,
        dead:false,
        moving:false
    };
    const fallback = makeHumanoid('NPC fallback', modelIndex===4 ? materials.orange : materials.cloth);
    fallback.setLocalPosition(0,-.05,0);
    n.addChild(fallback);
    app.root.addChild(n);
    npcs.push(n);
    loadContainer(modelUrls[modelIndex % modelUrls.length])
        .then(asset => attachContainerVisual(n,asset,fallback,1.72))
        .catch(() => null);
    return n;
}
spawnNpc([-9,1.1,12],2);
spawnNpc([13,1.1,9],3);
spawnNpc([-24,1.1,-13],4);
spawnNpc([38,1.1,12],5);

setBoot('Preparando herramientas…', 64);

const viewRoot = new pc.Entity('Viewmodel');
viewRoot.userData = {};
camera.addChild(viewRoot);
viewRoot.setLocalPosition(.32,-.33,-.62);

function vmBox(name,pos,scale,material) {
    const e = new pc.Entity(name);
    e.setLocalPosition(pos[0],pos[1],pos[2]);
    e.setLocalScale(scale[0],scale[1],scale[2]);
    e.addComponent('render',{type:'box',castShadows:false,receiveShadows:false});
    applyMaterial(e,material);
    viewRoot.addChild(e);
    return e;
}
const vmBody = vmBox('Tool body',[0,0,0],[.18,.22,.52],materials.metal);
const vmCore = vmBox('Tool core',[0,.03,-.29],[.11,.11,.16],materials.cyan);
vmBox('Grip',[0,-.16,.11],[.12,.28,.13],materials.rubber);
const vmHand = vmBox('Hand',[.13,-.12,.18],[.12,.16,.14],materials.skin);

Promise.all([
    loadContainer('/models/pulse-sidearm.glb').catch(()=>null),
    loadContainer('/models/laser-rifle.glb').catch(()=>null)
]).then(([pistol,rifle]) => {
    if (pistol) {
        const v = pistol.resource.instantiateRenderEntity({castShadows:false});
        v.setLocalScale(.8,.8,.8);
        v.setLocalEulerAngles(0,90,90);
        v.setLocalPosition(.02,-.04,-.1);
        viewRoot.addChild(v);
        v.enabled = false;
        viewRoot.userData.pistol = v;
    }
    if (rifle) {
        const v = rifle.resource.instantiateRenderEntity({castShadows:false});
        v.setLocalScale(.75,.75,.75);
        v.setLocalEulerAngles(0,90,90);
        v.setLocalPosition(.02,-.03,-.1);
        viewRoot.addChild(v);
        viewRoot.userData.rifle = v;
    }
    updateToolVisual();
});

function updateToolVisual() {
    const pistol = viewRoot.userData.pistol;
    const rifle = viewRoot.userData.rifle;
    if (pistol) pistol.enabled = state.tool === 2;
    if (rifle) rifle.enabled = state.tool === 0 || state.tool === 1;
    const hasAsset = (state.tool===2 && pistol) || ((state.tool===0 || state.tool===1) && rifle);
    vmBody.enabled = !hasAsset && state.tool !== 3;
    vmCore.enabled = !hasAsset && state.tool !== 3;
    vmHand.enabled = true;
    statusEl.textContent = ['IMÁN · listo','KIT · seleccioná dos objetos','ARMA · impulso','MANOS · empujar'][state.tool];
    document.querySelectorAll('.toolbelt button').forEach((b,i)=>b.classList.toggle('active',i===state.tool));
}

function cameraForward() {
    return camera.forward.clone();
}
function eyePosition() {
    const p = player.getPosition();
    return new pc.Vec3(p.x,p.y+.55,p.z);
}
function rayFromCamera(distance=20) {
    const from = eyePosition();
    const dir = cameraForward();
    const to = from.clone().add(dir.mulScalar(distance));
    return app.systems.rigidbody.raycastFirst(from,to,{
        filterCallback:(entity)=>entity!==player
    });
}
function isDynamicTarget(e) {
    return dynamicProps.includes(e) || npcs.includes(e);
}
function setTool(index) {
    state.tool = clamp(index,0,3);
    state.held = null;
    state.weldFirst = null;
    updateToolVisual();
}

function createWeld(a,b,point) {
    const j = new pc.Entity('Weld');
    j.setPosition(point);
    j.addComponent('joint',{
        type:'fixed',
        entityA:a,
        entityB:b || null,
        enableCollision:false,
        breakImpulse:140
    });
    app.root.addChild(j);
    welds.push(j);
    toast('Soldadura creada');
}
function damageNpc(npc, impulse) {
    if (!npc || npc.userData.dead) return;
    npc.userData.hp -= 45;
    if (npc.rigidbody) npc.rigidbody.applyImpulse(impulse);
    if (npc.userData.hp <= 0) {
        npc.userData.dead = true;
        npc.rigidbody.angularFactor = new pc.Vec3(1,1,1);
        npc.rigidbody.linearDamping = .03;
        npc.rigidbody.angularDamping = .18;
        npc.rigidbody.applyImpulse(impulse.clone().mulScalar(1.5));
    }
}
function fireTool(button=0) {
    const hit = rayFromCamera(24);
    const forward = cameraForward();
    if (state.tool === 0) {
        if (button === 2 && state.held && state.held.rigidbody) {
            state.held.rigidbody.applyImpulse(forward.mulScalar(26));
            state.held = null;
            toast('Lanzado');
            return;
        }
        if (hit && isDynamicTarget(hit.entity) && hit.entity.rigidbody) {
            state.held = hit.entity;
            state.heldDistance = clamp(hit.point.distance(eyePosition()),2.2,9);
            toast('Objeto capturado');
        }
    } else if (state.tool === 1) {
        if (!hit || !isDynamicTarget(hit.entity)) return;
        if (!state.weldFirst) {
            state.weldFirst = hit.entity;
            toast('Primer objeto seleccionado');
        } else if (hit.entity !== state.weldFirst) {
            createWeld(state.weldFirst,hit.entity,hit.point);
            state.weldFirst = null;
        }
    } else if (state.tool === 2) {
        if (!hit) return;
        const impulse = forward.mulScalar(23);
        if (hit.entity && hit.entity.rigidbody && isDynamicTarget(hit.entity)) hit.entity.rigidbody.applyImpulse(impulse);
        if (npcs.includes(hit.entity)) damageNpc(hit.entity,impulse);
        markHit();
    } else {
        if (!hit) return;
        const impulse = forward.mulScalar(11);
        if (hit.entity && hit.entity.rigidbody && isDynamicTarget(hit.entity)) hit.entity.rigidbody.applyImpulse(impulse);
        if (npcs.includes(hit.entity)) damageNpc(hit.entity,impulse);
    }
}

canvas.addEventListener('mousedown',(e)=>{
    if (!state.playing) return;
    if (e.button===0 || e.button===2) fireTool(e.button);
});
canvas.addEventListener('mouseup',(e)=>{
    if (state.tool===0 && e.button===0) state.held = null;
});
canvas.addEventListener('contextmenu',(e)=>e.preventDefault());
canvas.addEventListener('wheel',(e)=>{
    if (state.tool===0) state.heldDistance = clamp(state.heldDistance + Math.sign(e.deltaY)*.5,2,10);
},{passive:true});

window.addEventListener('mousemove',(e)=>{
    if (!state.playing || document.pointerLockElement!==canvas) return;
    state.yaw -= e.movementX * .12;
    state.pitch = clamp(state.pitch - e.movementY * .1,-78,78);
});
window.addEventListener('keydown',(e)=>{
    state.keys.add(e.code);
    if (e.code==='Space') state.jumpQueued = true;
    if (e.code==='Digit1') setTool(0);
    if (e.code==='Digit2') setTool(1);
    if (e.code==='Digit3') setTool(2);
    if (e.code==='Digit4') setTool(3);
    if (e.code==='KeyC') state.thirdPerson = !state.thirdPerson;
    if (e.code==='KeyQ') togglePanel('spawnMenu');
    if (e.code==='KeyP') togglePanel('characterMenu');
    if (e.code==='KeyX' && welds.length) {
        const j = welds.pop();
        j.destroy();
        toast('Última soldadura eliminada');
    }
    if (e.code==='F3') cycleQuality();
});
window.addEventListener('keyup',(e)=>state.keys.delete(e.code));

function togglePanel(id) {
    const panel = $(id);
    const open = panel.classList.contains('hidden');
    document.querySelectorAll('.side-panel').forEach(p=>p.classList.add('hidden'));
    if (open) {
        panel.classList.remove('hidden');
        document.exitPointerLock?.();
    }
}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.add('hidden')));
document.querySelectorAll('[data-spawn]').forEach(b=>b.addEventListener('click',()=>spawnAtPlayer(b.dataset.spawn)));
document.querySelectorAll('.toolbelt button').forEach((b,i)=>b.addEventListener('click',()=>setTool(i)));

function spawnAtPlayer(kind) {
    const p = player.getPosition();
    const f = cameraForward();
    const pos = [p.x+f.x*3,p.y+1.3,p.z+f.z*3];
    if (kind==='crate') dynamicBox('crate',pos,[1.5,1.5,1.5],12,materials.wood);
    else if (kind==='barrel') dynamicBox('barrel',pos,[1.1,2,1.1],22,materials.metal);
    else if (kind==='beam') dynamicBox('beam',pos,[3.5,.5,.5],30,materials.metal);
    else if (kind==='ball') dynamicSphere('ball',pos,.85,9,materials.orange);
    else if (kind==='pallet') dynamicBox('pallet',pos,[2.3,.35,1.6],18,materials.wood);
    else if (kind==='npc') spawnNpc(pos,(npcs.length+2)%modelUrls.length);
    toast(kind.toUpperCase() + ' creado');
}

const charModels=['Operario','Exploradora','Técnico','Rescatista'];
const charBuilds=['Delgada','Media','Robusta'];
$('charModel').addEventListener('click',()=>{
    state.avatarModel=(state.avatarModel+1)%charModels.length;
    $('charModel').textContent=charModels[state.avatarModel];
});
$('charBuild').addEventListener('click',()=>{
    state.build=(state.build+1)%charBuilds.length;
    $('charBuild').textContent=charBuilds[state.build];
    updateAvatarScale();
});
$('charHeight').addEventListener('input',(e)=>{
    state.height=Number(e.target.value)/100;
    updateAvatarScale();
});
const colors=['#225a70','#8e4229','#575f30','#50375f','#273137','#9c7a41'];
for (const hex of colors) {
    const b=document.createElement('button');
    b.style.background=hex;
    b.addEventListener('click',()=>{
        const c=new pc.Color().fromString(hex);
        state.shirt=c;
        materials.cloth.diffuse=c;
        materials.cloth.update();
        document.querySelectorAll('#charColors button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
    });
    $('charColors').appendChild(b);
}
function updateAvatarScale() {
    const width=[.9,1,1.12][state.build];
    const model=player.userData.modelVisual || playerFallback;
    model.setLocalScale(width*state.height,state.height,width*state.height);
}

function cycleQuality() {
    state.quality=(state.quality+1)%3;
    const dpr=[.75,1,Math.min(1.5,window.devicePixelRatio||1)][state.quality];
    app.graphicsDevice.maxPixelRatio=dpr;
    sun.light.castShadows=state.quality>0;
    app.scene.fog.end=[105,145,180][state.quality];
    toast(['BAJO','ALTO','ULTRA'][state.quality]);
}

$('enter').addEventListener('click',()=>{
    state.playing=true;
    startOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    try {
        const promise=canvas.requestPointerLock?.();
        if (promise && typeof promise.catch==='function') promise.catch(()=>{});
    } catch {}
});

setBoot('Arrancando simulación…', 82);
app.start();

let wasGrounded=false;
let fpsTimer=0;
let fpsFrames=0;
let displayedFps=0;

function grounded() {
    const p=player.getPosition();
    const from=new pc.Vec3(p.x,p.y-.55,p.z);
    const to=new pc.Vec3(p.x,p.y-1.08,p.z);
    return !!app.systems.rigidbody.raycastFirst(from,to,{filterCallback:(e)=>e!==player});
}
function updatePlayer(dt) {
    if (!state.playing || fatal) return;
    const keys=state.keys;
    const forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
    const strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
    const sprint=keys.has('ShiftLeft')||keys.has('ShiftRight');
    state.crouch=keys.has('ControlLeft')||keys.has('ControlRight');
    const speed=state.crouch?2.4:(sprint?7.2:4.5);
    const r=state.yaw*Math.PI/180;
    const sin=Math.sin(r), cos=Math.cos(r);
    let vx=(-sin*forward+cos*strafe);
    let vz=(-cos*forward-sin*strafe);
    const len=Math.hypot(vx,vz);
    if (len>0) { vx=vx/len*speed; vz=vz/len*speed; }
    const vel=player.rigidbody.linearVelocity;
    player.rigidbody.linearVelocity=new pc.Vec3(vx,vel.y,vz);
    const g=grounded();
    if (state.jumpQueued && g) {
        player.rigidbody.applyImpulse(0,420,0);
    }
    state.jumpQueued=false;
    wasGrounded=g;

    if (player.getPosition().y < -18) {
        player.rigidbody.teleport(0,1.2,17);
        player.rigidbody.linearVelocity=pc.Vec3.ZERO;
    }
}
function updateCamera(dt) {
    const p=player.getPosition();
    const eye=new pc.Vec3(p.x,p.y+(state.crouch?.28:.58),p.z);
    if (!state.thirdPerson) {
        camera.setPosition(eye);
        camera.setEulerAngles(state.pitch,state.yaw,0);
        viewRoot.enabled=true;
        if (player.userData.modelVisual) player.userData.modelVisual.enabled=false;
        else playerFallback.enabled=false;
    } else {
        const yawRad=state.yaw*Math.PI/180;
        const pitchRad=state.pitch*Math.PI/180;
        const dist=5.2;
        const shoulder=.55;
        const desired=new pc.Vec3(
            eye.x+Math.sin(yawRad)*dist+Math.cos(yawRad)*shoulder,
            eye.y+1.1-Math.sin(pitchRad)*1.5,
            eye.z+Math.cos(yawRad)*dist-Math.sin(yawRad)*shoulder
        );
        const hit=app.systems.rigidbody.raycastFirst(eye,desired,{filterCallback:(e)=>e!==player});
        const target=hit?hit.point.clone().add(hit.normal.clone().mulScalar(.22)):desired;
        const current=camera.getPosition();
        current.lerp(current,target,1-Math.exp(-dt*14));
        camera.setPosition(current);
        camera.lookAt(eye);
        viewRoot.enabled=false;
        if (player.userData.modelVisual) player.userData.modelVisual.enabled=true;
        else playerFallback.enabled=true;
    }
}
function updateHeld() {
    if (!state.held || !state.held.rigidbody) return;
    const origin=eyePosition();
    const target=origin.add(cameraForward().mulScalar(state.heldDistance));
    const pos=state.held.getPosition();
    const delta=target.sub(pos);
    const vel=state.held.rigidbody.linearVelocity;
    const force=delta.mulScalar(55*state.held.rigidbody.mass).sub(vel.mulScalar(7*state.held.rigidbody.mass));
    const max=1800;
    if (force.length()>max) force.normalize().mulScalar(max);
    state.held.rigidbody.applyForce(force);
}
function updateNpcs(dt) {
    const time=state.elapsed;
    for (const n of npcs) {
        if (!n.rigidbody || n.userData.dead) continue;
        const origin=n.userData.origin;
        const pos=n.getPosition();
        const target=new pc.Vec3(
            origin.x+Math.sin(time*.35+n.userData.phase)*4,
            pos.y,
            origin.z+Math.cos(time*.31+n.userData.phase)*4
        );
        const dir=target.sub(pos);
        dir.y=0;
        const moving=dir.length()> .5;
        if (moving) dir.normalize();
        const v=n.rigidbody.linearVelocity;
        n.rigidbody.linearVelocity=new pc.Vec3(dir.x*1.25,v.y,dir.z*1.25);
        if (moving) n.setEulerAngles(0,Math.atan2(-dir.x,-dir.z)*180/Math.PI,0);
        const av=n.userData.animVisual;
        if (av && av.anim) {
            try {
                const desired=moving?'Walk':'Idle';
                if (n.userData.animState!==desired) {
                    av.anim.baseLayer.transition(desired,.2);
                    n.userData.animState=desired;
                }
            } catch {}
        }
        if (pos.y < -18) {
            n.rigidbody.teleport(origin.x,1.1,origin.z);
            n.rigidbody.linearVelocity=pc.Vec3.ZERO;
        }
    }
}
function recoverProps() {
    for (const p of dynamicProps) {
        if (!p.rigidbody) continue;
        if (p.getPosition().y < -20) {
            const s=p.userData.spawn;
            p.rigidbody.teleport(s.x,s.y+1,s.z);
            p.rigidbody.linearVelocity=pc.Vec3.ZERO;
            p.rigidbody.angularVelocity=pc.Vec3.ZERO;
        }
    }
}
function updateSector() {
    const p=player.getPosition();
    let s='SPAWN YARD';
    if (p.x<-20 && p.z>5) s='WHITE ROOM';
    else if (p.z<-25 && p.x<28) s='DARK BLOCK';
    else if (p.x>20 && p.z>0) s='EAST HANGAR';
    else if (p.x>27 && p.z<-21) s='TOWER';
    else if (p.z<-42 && p.x<1) s='SERVICE TUNNEL';
    else if (p.x< -8 && p.z<0) s='GRASS FIELD';
    else if (p.z<5 && p.z>-14 && p.x>-10 && p.x<15) s='WATER BASIN';
    sectorEl.textContent=s;
}

app.on('update',(dt)=>{
    state.elapsed+=dt;
    updatePlayer(dt);
    updateCamera(dt);
    updateHeld();
    updateNpcs(dt);
    recoverProps();
    updateSector();

    fpsTimer+=dt;
    fpsFrames++;
    if (fpsTimer>=.5) {
        displayedFps=Math.round(fpsFrames/fpsTimer);
        fpsTimer=0;
        fpsFrames=0;
        perfEl.textContent='FPS '+displayedFps+'\\nDRAW '+app.graphicsDevice._drawCallsPerFrame;
    }
});

Promise.allSettled([playerModelPromise]).finally(()=>{
    setBoot('Listo',100);
    setTimeout(()=>{
        boot.classList.add('hidden');
        startOverlay.classList.remove('hidden');
    },180);
});

window.__RIGYARD_TEST__ = {
    ready:true,
    snapshot() {
        const p=player.getPosition();
        return {
            physics:!!app.systems.rigidbody.physicsWorld,
            player:{x:p.x,y:p.y,z:p.z},
            props:dynamicProps.length,
            npcs:npcs.length,
            thirdPerson:state.thirdPerson,
            tool:state.tool,
            welds:welds.length
        };
    },
    spawn(kind){ spawnAtPlayer(kind); },
    setThirdPerson(v){ state.thirdPerson=!!v; updateCamera(1/60); },
    setPlaying(v){ state.playing=!!v; },
    app
};

console.info('[RIGYARD] ready', window.__RIGYARD_TEST__.snapshot());
