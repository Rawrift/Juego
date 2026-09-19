const TAU = Math.PI * 2;

export function applyVisualOverhaul({ pc, app, materials, box, cylinder, loadContainer, camera, sun }) {
  const decor = [];
  const assetVisuals = [];
  const flickerLights = [];
  const cache = new Map();

  function loadTextureAsset(url) {
    return new Promise((resolve,reject)=>{
      const asset=new pc.Asset(url.split('/').pop(),'texture',{url});
      asset.on('load',()=>{
        const t=asset.resource;
        t.addressU=pc.ADDRESS_REPEAT; t.addressV=pc.ADDRESS_REPEAT;
        t.minFilter=pc.FILTER_LINEAR_MIPMAP_LINEAR; t.magFilter=pc.FILTER_LINEAR;
        resolve(t);
      });
      asset.on('error',(err)=>reject(err || new Error('Texture load failed: '+url)));
      app.assets.add(asset); app.assets.load(asset);
    });
  }

  function applyPbrPair(material,diffuse,normal,tile=6,bump=.6) {
    if(!material) return;
    material.diffuseMap=diffuse; material.normalMap=normal;
    material.diffuseMapTiling=new pc.Vec2(tile,tile); material.normalMapTiling=new pc.Vec2(tile,tile);
    material.bumpiness=bump; material.update();
  }

  function applyPbrSet(material,maps,tile=6,bump=.65) {
    if(!material) return;
    const tiling=new pc.Vec2(tile,tile);
    material.diffuseMap=maps.diffuse||null;
    material.normalMap=maps.normal||null;
    material.glossMap=maps.rough||null;
    material.glossInvert=!!maps.rough;
    material.aoMap=maps.ao||null;
    material.metalnessMap=maps.metal||null;
    material.diffuseMapTiling=tiling;
    material.normalMapTiling=tiling;
    material.glossMapTiling=tiling;
    material.aoMapTiling=tiling;
    material.metalnessMapTiling=tiling;
    material.bumpiness=bump;
    material.aoIntensity=.82;
    material.gloss=maps.rough?1:material.gloss;
    material.update();
  }
  function replaceEntityMaterial(name,material) {
    const e=app.root.findByName(name);
    if(!e?.render) return false;
    e.render.meshInstances.forEach(mi=>mi.material=material);
    return true;
  }

  const rng = (seed = 1) => {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };

  function texture(key, draw, size = 192, repeat = true) {
    if (cache.has(key)) return cache.get(key);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    draw(g, size);
    const t = new pc.Texture(app.graphicsDevice, {
      width:size, height:size, format:pc.PIXELFORMAT_RGBA8, mipmaps:true,
      addressU:repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      addressV:repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE
    });
    t.setSource(cv);
    cache.set(key,t);
    return t;
  }

  function noiseNormal(key, amount = 18, seed = 1) {
    const random = rng(seed);
    return texture('n:' + key, (g,size) => {
      const im = g.createImageData(size,size);
      for (let i=0;i<im.data.length;i+=4) {
        im.data[i] = 128 + (random()-.5)*amount;
        im.data[i+1] = 128 + (random()-.5)*amount;
        im.data[i+2] = 247;
        im.data[i+3] = 255;
      }
      g.putImageData(im,0,0);
    },128,true);
  }

  const waterNormal = texture('water-normal',(g,size)=>{
    const im=g.createImageData(size,size);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const i=(y*size+x)*4;
      im.data[i]=128+Math.sin(x*.19+Math.sin(y*.08))*22;
      im.data[i+1]=128+Math.cos(y*.16+Math.cos(x*.07))*22;
      im.data[i+2]=248; im.data[i+3]=255;
    }
    g.putImageData(im,0,0);
  },192,true);

  function makeMat(name,{color=new pc.Color(1,1,1),metalness=0,gloss=.3,normal=null,bump=.5,opacity,emissive,emissiveIntensity=1}={}) {
    const m=new pc.StandardMaterial();
    m.name=name; m.diffuse=color; m.metalness=metalness; m.useMetalness=true; m.gloss=gloss;
    if(normal){m.normalMap=normal;m.bumpiness=bump;}
    if(opacity!==undefined){m.opacity=opacity;m.blendType=pc.BLEND_NORMAL;m.depthWrite=opacity>.96;}
    if(emissive){m.emissive=emissive;m.emissiveIntensity=emissiveIntensity;}
    m.update(); return m;
  }

  const surface = [
    ['concrete',20,.55,5,11],['darkConcrete',18,.62,5,12],['plaster',12,.36,4,13],
    ['metal',10,.34,3,14],['grass',30,.7,7,15],['wood',22,.52,3,16],['tile',8,.22,4,17],['hazard',9,.28,3,18]
  ];
  for(const [name,strength,bump,tile,seed] of surface){
    const m=materials[name]; if(!m) continue;
    m.normalMap=noiseNormal(name,strength,seed);
    m.normalMapTiling=new pc.Vec2(tile,tile);
    m.bumpiness=bump; m.update();
  }
  // surfaceTintPass: diffuse textures should carry the color; avoid multiplying them into darkness.
  const surfaceTints = {
    concrete:[.98,.99,.98], darkConcrete:[.78,.82,.83], plaster:[1,1,.98],
    metal:[.93,.96,.96], grass:[.96,1,.91], wood:[1,.94,.86], tile:[1,1,1], hazard:[1,1,1]
  };
  for (const [name,rgb] of Object.entries(surfaceTints)) {
    const m=materials[name];
    if(!m) continue;
    m.diffuse=new pc.Color(rgb[0],rgb[1],rgb[2]);
    m.update();
  }

  if(materials.water){
    materials.water.normalMap=waterNormal;
    materials.water.normalMapTiling=new pc.Vec2(5,4);
    materials.water.bumpiness=.72; materials.water.gloss=.94;
    materials.water.metalness=.06; materials.water.useMetalness=true;
    materials.water.opacity=.57; materials.water.depthWrite=false; materials.water.update();
  }

  const rust=makeMat('rust',{color:new pc.Color(.32,.14,.055),metalness:.68,gloss:.16,normal:noiseNormal('rust',32,31),bump:.72});
  const steel=makeMat('painted-steel',{color:new pc.Color(.105,.18,.2),metalness:.72,gloss:.42,normal:noiseNormal('steel',12,32),bump:.35});
  const black=makeMat('black-steel',{color:new pc.Color(.028,.038,.043),metalness:.84,gloss:.5,normal:noiseNormal('black',9,33),bump:.25});
  const glass=makeMat('glass',{color:new pc.Color(.11,.2,.23),gloss:.94,opacity:.38});
  const wet=makeMat('wet',{color:new pc.Color(.055,.075,.082),gloss:.92,opacity:.58,normal:waterNormal,bump:.24});
  const yellow=makeMat('safety-yellow',{color:new pc.Color(.92,.56,.025),metalness:.28,gloss:.38,normal:noiseNormal('yellow',8,34),bump:.2});
  const warm=makeMat('warm-light',{color:new pc.Color(.4,.17,.045),gloss:.6,emissive:new pc.Color(1,.35,.08),emissiveIntensity:3});
  const cold=makeMat('cold-light',{color:new pc.Color(.045,.15,.2),gloss:.6,emissive:new pc.Color(.12,.62,1),emissiveIntensity:2.6});

  const addBox=(name,pos,scale,mat,solid=false,shadow=true)=>{
    const e=box(name,pos,scale,mat,solid,{castShadows:shadow,receiveShadows:true}); decor.push(e); return e;
  };
  const addCyl=(name,pos,scale,mat,solid=false,rot=null)=>{
    const e=cylinder(name,pos,scale,mat,solid); if(rot)e.setEulerAngles(...rot); decor.push(e); return e;
  };
  const hiddenCollider=(name,pos,size)=>{
    const e=addBox(name,pos,size,materials.metal,true,false); if(e.render)e.render.enabled=false; return e;
  };

  function signMat(text,sub,accent='#f2a51d'){
    const tex=texture('sign:'+text+sub,(g,s)=>{
      g.fillStyle='#111719';g.fillRect(0,0,s,s);
      g.fillStyle=accent;g.fillRect(0,0,s,17);g.fillRect(0,s-10,s,10);
      g.fillStyle='rgba(255,255,255,.055)';for(let y=26;y<s;y+=18)g.fillRect(0,y,s,1);
      g.textAlign='center';g.textBaseline='middle';g.fillStyle='#f1f5f2';g.font='700 28px Arial';g.fillText(text,s/2,s*.42);
      g.fillStyle='#9caaad';g.font='600 12px Arial';g.fillText(sub,s/2,s*.63);
    },256,false);
    const m=makeMat('sign:'+text,{gloss:.42,emissive:new pc.Color(.05,.05,.05),emissiveIntensity:.4});
    m.diffuseMap=tex;m.update();return m;
  }
  function sign(name,pos,scale,rot,text,sub,accent){
    const e=addBox(name,pos,scale,signMat(text,sub,accent),false,false); if(rot)e.setEulerAngles(...rot); return e;
  }
  function decalMat(name,kind){
    const tex=texture('decal:'+name,(g,s)=>{
      g.clearRect(0,0,s,s); const random=rng(name.length*971+kind.length*37);
      if(kind==='oil'){const grad=g.createRadialGradient(s*.5,s*.5,5,s*.5,s*.5,s*.48);grad.addColorStop(0,'rgba(8,10,10,.72)');grad.addColorStop(.55,'rgba(18,20,18,.42)');grad.addColorStop(1,'rgba(20,20,18,0)');g.fillStyle=grad;g.beginPath();g.ellipse(s*.5,s*.5,s*.44,s*.3,-.22,0,TAU);g.fill();for(let i=0;i<35;i++){g.fillStyle='rgba(6,8,8,'+(.08+random()*.18)+')';g.beginPath();g.arc(random()*s,random()*s,1+random()*5,0,TAU);g.fill();}}
      else if(kind==='tire'){g.strokeStyle='rgba(15,17,17,.45)';g.lineWidth=12;for(let x=35;x<s;x+=58){g.beginPath();g.moveTo(x,0);g.lineTo(x+30,s);g.stroke();}g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=3;for(let y=8;y<s;y+=18){g.beginPath();g.moveTo(0,y);g.lineTo(s,y+10);g.stroke();}}
      else if(kind==='rust'){for(let i=0;i<70;i++){const x=random()*s,y=random()*s*.8,r=3+random()*20,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(118,49,18,'+(.18+random()*.28)+')');gr.addColorStop(1,'rgba(92,38,14,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}for(let i=0;i<10;i++){const x=random()*s;g.fillStyle='rgba(94,39,17,.22)';g.fillRect(x,random()*s*.4,2+random()*5,s*(.18+random()*.45));}}
      else{g.strokeStyle='rgba(25,28,27,.42)';g.lineWidth=2;for(let i=0;i<18;i++){let x=random()*s,y=random()*s;g.beginPath();g.moveTo(x,y);for(let j=0;j<5;j++){x+=random()*34-17;y+=random()*32;g.lineTo(x,y);}g.stroke();}}
    },256,false);
    const m=makeMat('decal:'+name,{gloss:.12});m.diffuseMap=tex;m.opacityMap=tex;m.opacityMapChannel='a';m.blendType=pc.BLEND_NORMAL;m.depthWrite=false;m.depthBias=-.18;m.update();return m;
  }
  function floorDecal(name,pos,scale,material,rot=0){const e=new pc.Entity(name);e.setPosition(...pos);e.setLocalScale(scale[0],1,scale[1]);e.setEulerAngles(0,rot,0);e.addComponent('render',{type:'plane',castShadows:false,receiveShadows:false});e.render.meshInstances.forEach(mi=>mi.material=material);app.root.addChild(e);decor.push(e);return e;}
  function wallDecal(name,pos,scale,rot,material){const e=new pc.Entity(name);e.setPosition(...pos);e.setLocalScale(scale[0],1,scale[1]);e.setEulerAngles(...rot);e.addComponent('render',{type:'plane',castShadows:false,receiveShadows:false});e.render.meshInstances.forEach(mi=>mi.material=material);app.root.addChild(e);decor.push(e);return e;}

  function spot(name,pos,target,color,intensity,range,cone=34,shadows=true,flicker=0){
    const e=new pc.Entity(name);e.setPosition(...pos);
    e.addComponent('light',{type:'spot',color,intensity,range,castShadows:shadows,shadowResolution:shadows?1024:512,shadowBias:.12,innerConeAngle:Math.max(6,cone-12),outerConeAngle:cone});
    e.lookAt(...target);app.root.addChild(e);decor.push(e);if(flicker)flickerLights.push({e,base:intensity,phase:Math.random()*TAU,amount:flicker});return e;
  }
  function fixture(pos,mat,target,color,intensity=1.6,range=18,flicker=0){
    addBox('fixture',pos,[1.15,.1,.32],black,false,true);
    addBox('fixture glow',[pos[0],pos[1]-.075,pos[2]],[.95,.025,.22],mat,false,false);
    spot('work light',pos,target,color,intensity,range,38,intensity>1.8,flicker);
  }

  app.scene.ambientLight=new pc.Color(.15,.17,.18);
  app.scene.exposure=1.09;
  app.scene.fog.color=new pc.Color(.14,.18,.2);
  app.scene.fog.start=58;app.scene.fog.end=165;
  if(camera?.camera){camera.camera.clearColor=new pc.Color(.15,.205,.23);camera.camera.fov=74;camera.camera.farClip=240;}
  if(sun?.light){sun.light.color=new pc.Color(1,.9,.76);sun.light.intensity=1.65;sun.light.shadowResolution=2048;sun.light.shadowDistance=95;sun.light.shadowBias=.12;}
  const skyFill=new pc.Entity('Cool sky fill');
  skyFill.addComponent('light',{type:'directional',color:new pc.Color(.38,.53,.65),intensity:.62,castShadows:false});
  skyFill.setEulerAngles(38,145,0);
  app.root.addChild(skyFill);
  decor.push(skyFill);
  const spawnFill=new pc.Entity('Spawn ambient fill');
  spawnFill.setPosition(0,8,6);
  spawnFill.addComponent('light',{type:'omni',color:new pc.Color(.55,.68,.74),intensity:1.1,range:32,castShadows:false});
  app.root.addChild(spawnFill);
  decor.push(spawnFill);

  const skyline=[
    [-47,11,-59,14,22,7],[-27,9,-60,14,18,5],[-5,14,-61,20,28,8],[22,10,-61,15,20,7],[47,13,-60,18,26,8],
    [58,12,-35,8,24,15],[58,9,-8,8,18,18],[-58,11,-36,8,22,15],[-58,8,-8,7,16,15],[-58,10,26,8,20,16]
  ];
  skyline.forEach((v,i)=>addBox('skyline '+i,[v[0],v[1],v[2]],[v[3],v[4],v[5]],i%3?black:rust,false,false));
  [-38,-31,44].forEach(x=>{addCyl('stack',[x,15,-58],[1.2,28,1.2],rust,false);addCyl('stack cap',[x,29,-58],[1.5,.6,1.5],black,false);});

  for(const x of [16,24,32,40,48]){
    addBox('hangar truss',[x,6,2.4],[.34,11,.34],steel,false);
    addBox('hangar truss',[x,6,27.6],[.34,11,.34],steel,false);
    addBox('hangar beam',[x,10.7,15],[.28,.28,25],steel,false);
  }
  for(const z of [6,12,18,24]){
    addBox('storage rack',[45.5,1.8,z],[1.8,3.4,4],black,false);
    [1,2.2,3.4].forEach(y=>addBox('rack shelf',[45.5,y,z],[1.7,.12,3.9],rust,false));
  }
  addCyl('hangar duct',[30,8.7,26.1],[.45,33,.45],steel,false,[0,0,90]);
  addCyl('duct branch',[18,7,22],[.28,8,.28],steel,false,[90,0,0]);
  addCyl('duct branch',[38,7,22],[.28,8,.28],steel,false,[90,0,0]);
  fixture([19,10.5,8],warm,[19,0,8],new pc.Color(1,.55,.27),2.05,22);
  fixture([30,10.5,16],warm,[30,0,16],new pc.Color(1,.56,.28),2.3,24,.04);
  fixture([41,10.5,23],warm,[41,0,23],new pc.Color(1,.52,.25),2,22);

  for(const y of [4.4,8.4,12.4,16.4]){
    [31.6,35,38.4].forEach(x=>{addBox('tower glass',[x,y,-37.34],[2.5,1.05,.07],glass,false,false);addBox('tower glow',[x,y,-37.27],[2.05,.15,.025],warm,false,false);});
    addBox('stair glow',[29,y,-25],[.15,.14,2.4],cold,false,false);
  }
  sign('tower sign',[35,6.3,-24.24],[5.8,2.35,.07],[0,0,0],'TOWER 04','VERTICAL TEST / ACCESS','#f2a51d');
  addBox('tower floor stripe',[35,.13,-23.7],[12,.04,.36],yellow,false,false);
  addBox('tower floor stripe 2',[28.8,.13,-30],[.36,.04,12],yellow,false,false);
  [3.3,7.3,11.3,15.3].forEach((y)=>{
    addBox('tower catwalk rail',[35,y,-25.2],[11.5,.08,.08],yellow,false,false);
    for(const x of [29.5,35,40.5]) addCyl('tower rail post',[x,y-.55,-25.2],[.055,1.1,.055],yellow,false);
  });
  addCyl('tower red conduit',[42.2,8.8,-31.5],[.18,17.2,.18],rust,false);
  addCyl('tower steel conduit',[43,8.8,-31.5],[.12,17.2,.12],steel,false);
  fixture([31,4.1,-25.4],warm,[35,1,-31],new pc.Color(1,.58,.3),1.8,18);
  fixture([39,12.1,-25.4],cold,[35,7,-31],new pc.Color(.45,.75,1),1.5,18);

  [-43,-37,-31,-25].forEach(x=>fixture([x,8.8,18],cold,[x,0,18],new pc.Color(.72,.87,1),1.5,14));
  sign('light room sign',[-46.84,4.5,18],[.07,2.4,5],[0,90,0],'LIGHT ROOM','PHOTOMETRIC TEST','#6dc7ff');
  [-44,-38,-32].forEach(z=>fixture([11,7.6,z],cold,[11,0,z],new pc.Color(.11,.46,.67),1.25,12,.07));
  sign('dark room sign',[26.64,4.2,-37],[.07,2.4,5],[0,90,0],'DARK ROOM','LOW-LIGHT TEST','#2eb5df');

  for(const z of [-52.1,-43.9])for(const y of [1.6,2.7,3.8])addCyl('service pipe',[-14,y,z],[.17,27,.17],y===2.7?rust:steel,false,[0,0,90]);
  [-24,-18,-12,-6,0].forEach(x=>{addBox('cable tray',[x,5.35,-50.7],[4.4,.16,.8],black,false,false);addBox('tunnel glow',[x,5.7,-48],[1.35,.04,.2],cold,false,false);});
  sign('tunnel sign',[-28.64,3.4,-48],[.07,2.3,4.8],[0,90,0],'SERVICE','UTILITIES / MAINTENANCE','#e0a11b');

  [-9,-6,6,9].forEach((x,i)=>addCyl('bollard',[x,.65,19.6],[.18,1.3,.18],i<2?yellow:steel,true));
  sign('yard sign',[0,4.3,41.35],[8.6,3.2,.1],[0,0,0],'RIGYARD','PHYSICS / FABRICATION / TEST','#f4a11b');
  addBox('spawn safety lane',[-10,.135,15],[.22,.035,17],yellow,false,false);
  addBox('spawn safety lane',[10,.135,15],[.22,.035,17],yellow,false,false);
  [4,10,16,22].forEach(z=>addBox('spawn cross stripe',[0,.136,z],[20,.03,.12],yellow,false,false));
  [-7.5,-2.5,2.5,7.5].forEach(x=>{addBox('drain',[x,.17,3.2],[3.2,.04,.95],black,false,false);for(let gx=-1.2;gx<=1.2;gx+=.4)addBox('drain bar',[x+gx,.2,3.2],[.07,.035,.9],materials.metal,false,false);});
  [[-6,.18,6.5,4.5,2.2],[5,.18,5.3,3.2,1.6],[12,.17,8.3,2.8,1.3],[-12,.17,-3,4,1.5]].forEach(p=>addBox('puddle',[p[0],p[1],p[2]],[p[3],.025,p[4]],wet,false,false));
  addBox('loading dock',[16,.75,20],[8,1.5,7],materials.concrete,true);
  addBox('dock bumper',[12.3,.8,16.55],[1.2,.7,.25],materials.rubber,false);
  addBox('dock bumper',[19.7,.8,16.55],[1.2,.7,.25],materials.rubber,false);
  sign('dock sign',[16,3.2,16.44],[6.2,1.8,.07],[0,0,0],'LOADING 02','KEEP CLEAR','#f4a11b');

  [-7,-2,3,8,13].forEach(x=>addCyl('basin post',[x,.95,-12],[.07,1.8,.07],yellow,false));
  addBox('basin bridge',[3,1.15,-4],[3.2,.25,15],steel,true);
  [-10,-5,0,3].forEach(z=>{addCyl('bridge post',[1.5,2,z],[.07,1.55,.07],yellow,false);addCyl('bridge post',[4.5,2,z],[.07,1.55,.07],yellow,false);});
  addBox('bridge rail',[1.5,2.65,-4],[.08,.08,15],yellow,false,false);
  addBox('bridge rail',[4.5,2.65,-4],[.08,.08,15],yellow,false,false);

  for(let i=0;i<9;i++){const x=-43+i*4.2,z=-2-(i%3)*6;const e=addBox('old foundation',[x,.12,z],[2.6,.28,1.8],i%2?rust:materials.concrete,false,false);e.setEulerAngles(0,(i*17)%45-20,0);}
  [-43,-35,-27,-19].forEach(x=>{addCyl('old riser',[x,1.1,-28],[.2,2.2,.2],rust,false);addCyl('old header',[x+2,2.1,-28],[.18,4,.18],rust,false,[0,0,90]);});

  const oilDecal=decalMat('oil','oil'),tireDecal=decalMat('tire','tire'),rustDecal=decalMat('rust','rust'),crackDecal=decalMat('cracks','crack');
  floorDecal('oil spill A',[-4,.195,8],[4.8,3.2],oilDecal,-18);
  floorDecal('oil spill B',[27,.19,13],[5.2,3.4],oilDecal,22);
  floorDecal('tire marks',[18,.195,19],[4.5,13],tireDecal,-8);
  floorDecal('cracked apron',[-13,.19,27],[6.5,5.5],crackDecal,14);
  wallDecal('hangar rust',[50.0,5.5,14],[8,6],[0,0,90],rustDecal);
  wallDecal('tower rust',[41.62,10,-31],[7,11],[0,0,90],rustDecal);
  wallDecal('tunnel stain',[-14,3.1,-52.72],[11,4],[90,0,0],rustDecal);
  spot('spawn hero',[0,13,28],[0,0,8],new pc.Color(.72,.86,1),1.4,38,28,true);
  spot('tower hero',[47,17,-17],[35,7,-31],new pc.Color(1,.52,.23),1.15,44,24,true);
  spot('grass hero',[-47,12,-5],[-28,0,-17],new pc.Color(.35,.56,.68),.72,42,30,false);

  const pbrTextureReady=Promise.all([
    loadTextureAsset('/textures/concrete_floor_diff_1k.jpg'),loadTextureAsset('/textures/concrete_floor_nor_gl_1k.jpg'),loadTextureAsset('/textures/concrete_floor_rough_1k.jpg'),loadTextureAsset('/textures/concrete_floor_ao_1k.jpg'),
    loadTextureAsset('/textures/metal_plate_diff_1k.jpg'),loadTextureAsset('/textures/metal_plate_nor_gl_1k.jpg'),loadTextureAsset('/textures/metal_plate_rough_1k.jpg'),loadTextureAsset('/textures/metal_plate_ao_1k.jpg'),loadTextureAsset('/textures/metal_plate_metal_1k.jpg'),
    loadTextureAsset('/textures/sparse_grass_diff_1k.jpg'),loadTextureAsset('/textures/sparse_grass_nor_gl_1k.jpg'),loadTextureAsset('/textures/sparse_grass_rough_1k.jpg'),loadTextureAsset('/textures/sparse_grass_ao_1k.jpg'),
    loadTextureAsset('/textures/hangar_concrete_floor_diff_1k.jpg'),loadTextureAsset('/textures/hangar_concrete_floor_nor_gl_1k.jpg'),loadTextureAsset('/textures/hangar_concrete_floor_rough_1k.jpg'),loadTextureAsset('/textures/hangar_concrete_floor_ao_1k.jpg'),
    loadTextureAsset('/textures/box_profile_metal_sheet_diff_1k.jpg'),loadTextureAsset('/textures/box_profile_metal_sheet_nor_gl_1k.jpg'),loadTextureAsset('/textures/box_profile_metal_sheet_rough_1k.jpg'),loadTextureAsset('/textures/box_profile_metal_sheet_ao_1k.jpg'),loadTextureAsset('/textures/box_profile_metal_sheet_metal_1k.jpg'),
    loadTextureAsset('/textures/asphalt_01_diff_1k.jpg'),loadTextureAsset('/textures/asphalt_01_nor_gl_1k.jpg'),loadTextureAsset('/textures/asphalt_01_rough_1k.jpg'),loadTextureAsset('/textures/asphalt_01_ao_1k.jpg')
  ]).then((t)=>{
    const [cD,cN,cR,cA,mD,mN,mR,mA,mM,gD,gN,gR,gA,hD,hN,hR,hA,sD,sN,sR,sA,sM,aD,aN,aR,aA]=t;
    applyPbrSet(materials.concrete,{diffuse:cD,normal:cN,rough:cR,ao:cA},5.5,.7);
    applyPbrSet(materials.darkConcrete,{diffuse:cD,normal:cN,rough:cR,ao:cA},5.5,.72);materials.darkConcrete.diffuse=new pc.Color(.52,.55,.55);materials.darkConcrete.update();
    applyPbrSet(materials.plaster,{diffuse:cD,normal:cN,rough:cR,ao:cA},7,.28);materials.plaster.diffuse=new pc.Color(.94,.95,.92);materials.plaster.update();
    applyPbrSet(materials.metal,{diffuse:mD,normal:mN,rough:mR,ao:mA,metal:mM},7,.88);materials.metal.metalness=1;materials.metal.update();
    applyPbrSet(materials.grass,{diffuse:gD,normal:gN,rough:gR,ao:gA},8,.8);materials.grass.diffuse=new pc.Color(.9,.96,.86);materials.grass.update();
    const hangar=materials.concrete.clone();hangar.name='Hangar PBR';hangar.diffuse=new pc.Color(.9,.91,.89);applyPbrSet(hangar,{diffuse:hD,normal:hN,rough:hR,ao:hA},7,.8);replaceEntityMaterial('Hangar floor',hangar);
    const sheet=materials.metal.clone();sheet.name='Corrugated sheet PBR';sheet.diffuse=new pc.Color(.78,.8,.78);sheet.metalness=1;applyPbrSet(sheet,{diffuse:sD,normal:sN,rough:sR,ao:sA,metal:sM},5,.9);['Hangar east','Hangar north','Hangar south'].forEach(n=>replaceEntityMaterial(n,sheet));
    const asphalt=materials.darkConcrete.clone();asphalt.name='Asphalt PBR';asphalt.diffuse=new pc.Color(.72,.72,.7);applyPbrSet(asphalt,{diffuse:aD,normal:aN,rough:aR,ao:aA},7,.85);replaceEntityMaterial('Spawn pad',asphalt);
    window.__RIGYARD_VISUAL__.pbrTexturesSettled=true;window.__RIGYARD_VISUAL__.pbrMapCount=26;return true;
  }).catch((err)=>{console.warn('[RIGYARD PBR textures]',err);window.__RIGYARD_VISUAL__.pbrTexturesSettled=false;window.__RIGYARD_VISUAL__.pbrError=String(err?.stack||err?.message||err);return false;});

  const environmentLoads=[
    ['/models/grass.glb','grass'],['/models/shrub.glb','shrub'],['/models/fern.glb','fern'],
    ['/models/utility-pickup.glb','pickup'],['/models/service-truck.glb','truck']
  ].map(async([url,kind])=>{
    try{
      const asset=await loadContainer(url);
      if(kind==='grass'){
        const random=rng(510);
        for(let i=0;i<34;i++){const v=asset.resource.instantiateRenderEntity({castShadows:false});const s=.55+random()*.7;v.setLocalScale(s,s,s);v.setPosition(-45+random()*34,.12,-34+random()*30);v.setEulerAngles(0,random()*360,0);app.root.addChild(v);assetVisuals.push(v);}
      }else if(kind==='shrub'||kind==='fern'){
        const pts=kind==='shrub'?[[-43,.1,-8],[-39,.1,-23],[-23,.1,-31],[-17,.1,-6],[-51,.1,30],[52,.1,32]]:[[-42,.1,-14],[-31,.1,-4],[-25,.1,-24],[-15,.1,-12]];
        pts.forEach((p,i)=>{const v=asset.resource.instantiateRenderEntity({castShadows:false});const s=kind==='shrub'?.9:.72;v.setLocalScale(s,s,s);v.setPosition(...p);v.setEulerAngles(0,(i*79)%360,0);app.root.addChild(v);assetVisuals.push(v);});
      }else if(kind==='pickup'){
        const v=asset.resource.instantiateRenderEntity({castShadows:true});v.setPosition(23,.2,22.5);v.setEulerAngles(0,-112,0);app.root.addChild(v);assetVisuals.push(v);hiddenCollider('pickup collider',[23,1.05,22.5],[5.2,1.9,2.1]);
      }else{
        const v=asset.resource.instantiateRenderEntity({castShadows:true});v.setPosition(43,.2,7.5);v.setEulerAngles(0,90,0);app.root.addChild(v);assetVisuals.push(v);hiddenCollider('truck collider',[43,1.15,7.5],[6.6,2.3,2.4]);
      }
    }catch(err){console.warn('[RIGYARD visual asset]',kind,err);}
  });

  let t=0;
  app.on('update',dt=>{
    t+=dt;
    flickerLights.forEach(f=>{f.e.light.intensity=f.base*(1-f.amount*Math.max(0,Math.sin(t*19+f.phase)*Math.sin(t*7.3+f.phase*.4)));});
    if(materials.water){materials.water.opacity=.56+Math.sin(t*.7)*.018;materials.water.update();}
  });

  let audioStarted=false;
  function startAudio(){
    if(audioStarted)return; audioStarted=true;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ac=new AC();
      const master=ac.createGain();master.gain.value=.022;master.connect(ac.destination);
      const low=ac.createBiquadFilter();low.type='lowpass';low.frequency.value=190;low.Q.value=.5;low.connect(master);
      [47,94].forEach((hz,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type=i?'triangle':'sine';o.frequency.value=hz;g.gain.value=i?.22:.38;o.connect(g);g.connect(low);o.start();});
      const buf=ac.createBuffer(1,ac.sampleRate*3,ac.sampleRate),d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*.55;
      const n=ac.createBufferSource(),ng=ac.createGain(),nf=ac.createBiquadFilter();n.buffer=buf;n.loop=true;ng.gain.value=.17;nf.type='lowpass';nf.frequency.value=650;n.connect(nf);nf.connect(ng);ng.connect(master);n.start();
    }catch{}
  }

  const ready=Promise.all([Promise.allSettled(environmentLoads),pbrTextureReady]).then(()=>{
    window.__RIGYARD_VISUAL__={...window.__RIGYARD_VISUAL__,version:'cinematic-industrial-v3',decorCount:decor.length,assetVisualCount:assetVisuals.length,materialsUpgraded:surface.length,environmentAssetsSettled:true,pbrTexturesSettled:window.__RIGYARD_VISUAL__?.pbrTexturesSettled===true,pbrMapCount:window.__RIGYARD_VISUAL__?.pbrMapCount||0,decals:7};
    console.info('[RIGYARD visual]',window.__RIGYARD_VISUAL__);
    return window.__RIGYARD_VISUAL__;
  });
  window.__RIGYARD_VISUAL__={version:'cinematic-industrial-v3',decorCount:decor.length,assetVisualCount:0,materialsUpgraded:surface.length,environmentAssetsSettled:false,pbrTexturesSettled:false,pbrMapCount:0,decals:7};
  return {ready,startAudio};
}
