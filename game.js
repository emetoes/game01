// Sound System
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(frequency, duration, type = 'sine', volume = 0.3) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
}

function shootSound() {
    playSound(300, 0.1, 'square', 0.08);
    setTimeout(() => playSound(150, 0.05, 'square', 0.06), 50);
}

function hitSound() { playSound(100, 0.1, 'triangle', 0.12); }
function buildSound() { playSound(200, 0.15, 'sawtooth', 0.1); }
function damageSound() { playSound(80, 0.2, 'sawtooth', 0.12); }
function reloadSound() {
    playSound(400, 0.1, 'sine', 0.08);
    setTimeout(() => playSound(600, 0.15, 'sine', 0.08), 150);
}

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 150);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
sun.position.set(50, 100, 50);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
scene.add(sun);

const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x4a7c59, 0.3);
scene.add(hemiLight);

let collidables = [];
const rampColliders = [];
const enemies = [];
const bullets = [];
const trees = [];
const gridSize = 4; 

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500, 50, 50), 
    new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8, metalness: 0.2 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function createHealthBar(isWall = false) {
    const container = document.createElement('div');
    container.className = 'healthbar';
    const fill = document.createElement('div');
    fill.className = 'healthbar-fill ' + (isWall ? 'wall-fill' : 'enemy-fill');
    fill.style.width = '100%';
    container.appendChild(fill);
    document.body.appendChild(container);
    return { container, fill };
}

function createHumanoid(color) {
    const character = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.7 }));
    head.position.y = 1.5;
    head.castShadow = true;
    character.add(head);
    
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: color }));
    torso.position.y = 0.9;
    torso.castShadow = true;
    character.add(torso);
    
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), new THREE.MeshStandardMaterial({ color: color }));
    lArm.position.set(-0.35, 0.9, 0); character.add(lArm); character.userData.leftArm = lArm;
    
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), new THREE.MeshStandardMaterial({ color: color }));
    rArm.position.set(0.35, 0.9, 0); character.add(rArm); character.userData.rightArm = rArm;
    
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), new THREE.MeshStandardMaterial({ color: 0x2c3e50 }));
    lLeg.position.set(-0.15, 0.35, 0); character.add(lLeg); character.userData.leftLeg = lLeg;
    
    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), new THREE.MeshStandardMaterial({ color: 0x2c3e50 }));
    rLeg.position.set(0.15, 0.35, 0); character.add(rLeg); character.userData.rightLeg = rLeg;
    
    character.userData.animTime = 0;
    character.userData.vY = 0;
    
    if(color === 0xff4444) {
        character.userData.health = 100;
        character.userData.maxHealth = 100;
        character.userData.lastAttack = 0;
        character.userData.attackCooldown = 1000;
        character.userData.detectionRange = 30;
        character.userData.attackRange = 1.2;
        character.userData.speed = 0.04;
    }
    return character;
}

const player = createHumanoid(0x2196f3);
scene.add(player);
const camPivot = new THREE.Group();
camPivot.position.y = 1.6;
player.add(camPivot);
camPivot.add(camera);
camera.position.set(0, 0.5, 4);

let wood = 30;
let health = 100;
let activeSlot = 1;
let lastDamageTime = 0;
let gameStarted = false;
let currentAmmo = 30;
let reserveAmmo = 90;
let maxMagSize = 30;
let isReloading = false;
let killCount = 0;
let currentWave = 1;
let enemiesInWave = 5;
let enemiesKilledThisWave = 0;

function createTree(x, z) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), new THREE.MeshStandardMaterial({ color: 0x5d4037 }));
    trunk.position.y = 1.5;
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 2.5), new THREE.MeshStandardMaterial({ color: 0x2e7d32 }));
    leaves.position.y = 3.5;
    tree.add(trunk, leaves);
    tree.position.set(x, 0, z);
    scene.add(tree);
    trunk.userData.isTree = true;
    collidables.push(trunk);
    trees.push(tree);
}
for(let i=0; i<20; i++) createTree(Math.random()*100-50, Math.random()*100-50);

function spawnEnemy() {
    const e = createHumanoid(0xff4444);
    e.position.set(Math.random()*60-30, 0, Math.random()*60-30);
    scene.add(e);
    const hBar = createHealthBar(false);
    e.userData.healthBarElement = hBar.container;
    e.userData.healthBarFill = hBar.fill;
    
    const waveMultiplier = 1 + (currentWave - 1) * 0.15;
    e.userData.health = Math.floor(100 * waveMultiplier);
    e.userData.maxHealth = Math.floor(100 * waveMultiplier);
    e.userData.speed = 0.04 + (currentWave - 1) * 0.003;
    enemies.push(e);
}
for(let i=0; i<enemiesInWave; i++) spawnEnemy();

function damageWall(wall, amount) {
    if (!wall.userData.health) return;
    wall.userData.health -= amount;
    hitSound();
    if (!wall.userData.healthBarElement) {
        const hBar = createHealthBar(true);
        wall.userData.healthBarElement = hBar.container; wall.userData.healthBarFill = hBar.fill;
    }
    wall.userData.healthBarElement.style.display = 'block';
    wall.userData.healthBarFill.style.width = (wall.userData.health / wall.userData.maxHealth * 100) + '%';
    if (wall.userData.health <= 0) {
        if (wall.userData.healthBarElement) wall.userData.healthBarElement.remove();
        scene.remove(wall); collidables = collidables.filter(c => c !== wall);
    }
}

function build(type) {
    if(wood < 10) return;
    const gx = Math.round(player.position.x / gridSize) * gridSize;
    const gz = Math.round(player.position.z / gridSize) * gridSize;
    const angle = player.rotation.y;
    const snappedAngle = Math.round(angle / (Math.PI/2)) * (Math.PI/2);
    let normAngle = snappedAngle % (Math.PI * 2);
    if (normAngle < 0) normAngle += Math.PI * 2;

    let piece;
    if(type === 'wall') {
        piece = new THREE.Mesh(new THREE.BoxGeometry(gridSize, 3, 0.2), new THREE.MeshStandardMaterial({ color: 0x5d4037, side: THREE.DoubleSide }));
        const offsetX = Math.round(-Math.sin(normAngle)) * (gridSize/2);
        const offsetZ = Math.round(-Math.cos(normAngle)) * (gridSize/2);
        piece.position.set(gx + offsetX, 1.5, gz + offsetZ);
        piece.rotation.y = snappedAngle;
        piece.userData.type = 'wall';
        piece.userData.health = 100;
        piece.userData.maxHealth = 100;
        collidables.push(piece);
    } else {
        const rampGroup = new THREE.Group();
        const rampSurface = new THREE.Mesh(new THREE.BoxGeometry(gridSize, 0.2, gridSize * 1.414), new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
        rampSurface.position.y = gridSize / 2; rampSurface.rotation.x = -Math.PI / 4;
        rampGroup.add(rampSurface); rampGroup.position.set(gx, 0, gz);
        rampGroup.rotation.y = snappedAngle + Math.PI; piece = rampGroup;
        rampColliders.push(rampSurface);
    }
    wood -= 10; document.getElementById('mats').innerText = `WOOD: ${wood}`;
    scene.add(piece); buildSound();
}

function shoot() {
    if(currentAmmo === 0 || isReloading) return;
    currentAmmo--;
    updateAmmoDisplay();
    shootSound();
    
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({color: 0xffff00}));
    b.position.copy(player.position).add(new THREE.Vector3(0, 1.5, 0));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    b.userData.velocity = dir.multiplyScalar(1.2);
    b.userData.life = 100;
    scene.add(b);
    bullets.push(b);
    if(currentAmmo === 0 && reserveAmmo > 0) setTimeout(() => reload(), 500);
}

function harvest() {
    trees.forEach(tree => {
        if(player.position.distanceTo(tree.position) < 4) {
            wood += 10; document.getElementById('mats').innerText = `WOOD: ${wood}`;
            tree.scale.set(1.2, 1.2, 1.2); hitSound(); setTimeout(() => tree.scale.set(1, 1, 1), 100);
        }
    });
    const harvestRay = new THREE.Raycaster();
    harvestRay.setFromCamera(new THREE.Vector2(0,0), camera);
    const hits = harvestRay.intersectObjects(collidables);
    if(hits.length > 0 && hits[0].distance < 4 && hits[0].object.userData.type === 'wall') damageWall(hits[0].object, 10);
}

function updateAmmoDisplay() {
    document.getElementById('ammo-display').innerText = `AMMO: ${currentAmmo}/${reserveAmmo}`;
    document.getElementById('reload-prompt').style.display = (currentAmmo === 0 && reserveAmmo > 0) ? 'block' : 'none';
}

function reload() {
    if(isReloading || reserveAmmo === 0 || currentAmmo === maxMagSize) return;
    isReloading = true; reloadSound();
    document.getElementById('reload-prompt').innerText = 'Reloading...';
    document.getElementById('reload-prompt').style.display = 'block';
    setTimeout(() => {
        const ammoNeeded = maxMagSize - currentAmmo;
        const ammoToReload = Math.min(ammoNeeded, reserveAmmo);
        currentAmmo += ammoToReload; reserveAmmo -= ammoToReload;
        isReloading = false; updateAmmoDisplay();
    }, 2000);
}

function animateCharacter(character, isMoving, isAttacking = false) {
    if (isMoving || isAttacking) character.userData.animTime += 0.1;
    let tLAX = 0, tRAX = 0, tLLX = 0, tRLX = 0;
    if (isMoving || isAttacking) {
        const swing = Math.sin(character.userData.animTime) * (isAttacking ? 0.6 : 0.25);
        tLAX = swing; tRAX = -swing;
        if (isMoving) { const legSwing = Math.sin(character.userData.animTime) * 0.35; tLLX = legSwing; tRLX = -legSwing; }
    }
    const lf = 0.15;
    if (character.userData.leftArm) character.userData.leftArm.rotation.x += (tLAX - character.userData.leftArm.rotation.x) * lf;
    if (character.userData.rightArm) character.userData.rightArm.rotation.x += (tRAX - character.userData.rightArm.rotation.x) * lf;
    if (character.userData.leftLeg) character.userData.leftLeg.rotation.x += (tLLX - character.userData.leftLeg.rotation.x) * lf;
    if (character.userData.rightLeg) character.userData.rightLeg.rotation.x += (tRLX - character.userData.rightLeg.rotation.x) * lf;
}

let keys = {}, playerVY = 0, playerGrounded = true, pitch = 0;
let playerVelocity = new THREE.Vector3();
window.onkeydown = (e) => {
    if(!gameStarted) return;
    keys[e.code] = true;
    if(e.code === 'Digit1') { activeSlot = 1; updateInventoryUI(); }
    if(e.code === 'Digit2') { activeSlot = 2; updateInventoryUI(); }
    if(e.code === 'KeyQ') build('ramp');
    if(e.code === 'KeyE') build('wall');
    if(e.code === 'KeyR') reload();
};
window.onkeyup = (e) => keys[e.code] = false;

function updateInventoryUI() {
    document.getElementById('slot1').classList.toggle('active', activeSlot === 1);
    document.getElementById('slot2').classList.toggle('active', activeSlot === 2);
}

document.addEventListener('mousedown', () => {
    if(!gameStarted) return;
    if(document.pointerLockElement !== document.body) document.body.requestPointerLock();
    else { if(activeSlot === 1) shoot(); if(activeSlot === 2) harvest(); }
});

document.addEventListener('mousemove', (e) => {
    if(document.pointerLockElement === document.body) {
        const sens = 0.002; player.rotation.y -= e.movementX * sens;
        pitch = Math.max(-0.8, Math.min(0.8, pitch - e.movementY * sens));
        camPivot.rotation.x += (pitch - camPivot.rotation.x) * 0.3;
    }
});

document.getElementById('start-button').addEventListener('click', () => {
    document.getElementById('start-screen').style.display = 'none';
    gameStarted = true; audioCtx.resume(); document.body.requestPointerLock();
});

function updateUIHealthBar(mesh, offsetY = 2.2) {
    if(!mesh.userData.healthBarElement) return;
    const pos = new THREE.Vector3(); mesh.getWorldPosition(pos); pos.y += offsetY; pos.project(camera);
    mesh.userData.healthBarElement.style.left = (pos.x * 0.5 + 0.5) * window.innerWidth + 'px';
    mesh.userData.healthBarElement.style.top = (-pos.y * 0.5 + 0.5) * window.innerHeight + 'px';
    mesh.userData.healthBarElement.style.display = (pos.z > 1 || (mesh.userData.health >= mesh.userData.maxHealth && mesh.userData.type === 'wall')) ? 'none' : 'block';
}

function animate() {
    requestAnimationFrame(animate);
    if(!gameStarted) { renderer.render(scene, camera); return; }
    
    // Sprint logic
    const baseSpeed = 0.15;
    const sprintMultiplier = 1.6;
    const speed = keys['ShiftLeft'] || keys['ShiftRight'] ? baseSpeed * sprintMultiplier : baseSpeed;
    
    let moveDir = new THREE.Vector3(); let isMoving = false;
    if(keys['KeyW']) { moveDir.z -= 1; isMoving = true; }
    if(keys['KeyS']) { moveDir.z += 1; isMoving = true; }
    if(keys['KeyA']) { moveDir.x -= 1; isMoving = true; }
    if(keys['KeyD']) { moveDir.x += 1; isMoving = true; }
    moveDir.normalize().applyQuaternion(player.quaternion);
    
    if(isMoving) playerVelocity.lerp(moveDir.multiplyScalar(speed), 0.03); 
    else playerVelocity.multiplyScalar(0.85);
    
    if(playerVelocity.length() > 0.001) {
        const ray = new THREE.Raycaster(new THREE.Vector3(player.position.x, 0.5, player.position.z), playerVelocity.clone().normalize());
        if(!(ray.intersectObjects(collidables).length > 0 && ray.intersectObjects(collidables)[0].distance < 0.8)) player.position.add(playerVelocity);
    }
    
    animateCharacter(player, isMoving);
    player.position.y += playerVY; playerVY -= 0.01;
    const pDownRay = new THREE.Raycaster(new THREE.Vector3(player.position.x, player.position.y + 1.2, player.position.z), new THREE.Vector3(0, -1, 0));
    const pHit = pDownRay.intersectObjects([...collidables, ...rampColliders, floor]);
    if(pHit.length > 0 && pHit[0].distance <= 1.25) { player.position.y = (player.position.y + 1.2) - pHit[0].distance; playerVY = 0; playerGrounded = true; } else playerGrounded = false;
    if(keys['Space'] && playerGrounded) { playerVY = 0.2; playerGrounded = false; }
    
    enemies.forEach(en => {
        const dist = player.position.distanceTo(en.position);
        const dir = new THREE.Vector3().subVectors(player.position, en.position).normalize();
        if(dist > 30) return;
        const eRay = new THREE.Raycaster(new THREE.Vector3(en.position.x, 0.5, en.position.z), dir);
        const eHits = eRay.intersectObjects(collidables);
        let isBlocked = (eHits.length > 0 && eHits[0].distance < 0.8);
        if(!isBlocked && dist > 1.2) en.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(en.userData.speed));
        else if (isBlocked && eHits[0].object.userData.type === 'wall' && Date.now() - en.userData.lastAttack > 1000) { damageWall(eHits[0].object, 15); en.userData.lastAttack = Date.now(); }
        animateCharacter(en, !isBlocked && dist > 1.2); en.rotation.y = Math.atan2(dir.x, dir.z);
        if(dist < 1.2 && Date.now() - lastDamageTime > 1000) { 
            health -= 20; lastDamageTime = Date.now(); damageSound(); 
            document.getElementById('health-bar').style.width = health + '%'; 
            if(health <= 0) location.reload(); 
        }
        updateUIHealthBar(en);
    });
    
    collidables.forEach(c => { if(c.userData.type === 'wall') updateUIHealthBar(c, 1.8); });
    
    for(let i=bullets.length-1; i>=0; i--) {
        bullets[i].position.add(bullets[i].userData.velocity);
        enemies.forEach((en, eIdx) => {
            if(bullets[i] && bullets[i].position.distanceTo(en.position) < 1) {
                // Headshot detection (upper section of humanoid)
                const isHeadshot = bullets[i].position.y >= en.position.y + 1.3;
                const damage = isHeadshot ? 68 : 34; // Double damage for headshots
                
                en.userData.health -= damage;
                en.userData.healthBarFill.style.width = (en.userData.health / en.userData.maxHealth * 100) + '%';
                
                if(isHeadshot) {
                    playSound(800, 0.2, 'sine', 0.15); // High pitch headshot "ding"
                }

                scene.remove(bullets[i]); bullets.splice(i, 1);
                if(en.userData.health <= 0) {
                    scene.remove(en); en.userData.healthBarElement.remove(); enemies.splice(eIdx, 1);
                    killCount++; enemiesKilledThisWave++; document.getElementById('kill-counter').innerText = `ELIMINATIONS: ${killCount}`;
                    if(enemiesKilledThisWave >= enemiesInWave) {
                        currentWave++; enemiesKilledThisWave = 0; enemiesInWave = 5 + (currentWave - 1) * 2;
                        document.getElementById('wave-counter').innerText = `WAVE: ${currentWave}`;
                        setTimeout(() => { for(let i=0; i<enemiesInWave; i++) spawnEnemy(); }, 3000);
                    }
                }
            }
        });
        if(bullets[i] && bullets[i].userData.life-- <= 0) { scene.remove(bullets[i]); bullets.splice(i, 1); }
    }
    renderer.render(scene, camera);
}
animate();
updateAmmoDisplay();