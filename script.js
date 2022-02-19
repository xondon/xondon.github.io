import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/build/three.module.js';
import { GLTFLoader } from './scripts/GLTFLoader.js'
import { OrbitControls } from './scripts/OrbitControls.js'
//credits to "Numbers" (https://skfb.ly/o69IQ) by GimmeTheGucci is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

var sliderNum = 2
var loaded
var loadedClones = []
var loaded1
var loadedClones1 = []
const randWidth = -80
const randDepth = 80
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener( 'mousemove', onMouseMove, false );
window.addEventListener("resize", onWindowResize, false)
const first = document.querySelector(".first")
const second = document.querySelector(".second")
const left = document.querySelector(".left")
const right = document.querySelector(".right")
left.addEventListener("click", makeLeft, false)
right.addEventListener("click", makeRight, false)
const renderer = new THREE.WebGLRenderer({antialias:true})
first.appendChild(renderer.domElement)
const fov = 40;
const aspect = first.clientWidth / first.clientHeight
const near = 0.1;
const far = 500;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.position.z = 30
camera.position.y = 0
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0F0F0F)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enablePan = false
controls.enableRotate = false
var zoom = controls.target.distanceTo( controls.object.position )
const material = new THREE.MeshBasicMaterial({color: 0x008F11, side: THREE.DoubleSide})
const planegeo = new THREE.PlaneGeometry(50, 50, 4, 4)
const plane = new THREE.Mesh(planegeo, material)
//scene.add(plane)
plane.position.z -= 0
plane.position.y -= 20
plane.rotation.x -= Math.PI / 2
renderer.setPixelRatio(devicePixelRatio)
renderer.setSize(first.clientWidth, first.clientHeight)
const al = new THREE.AmbientLight(0xFFFFFF)
scene.add(al)
const slide1 = document.querySelector(".slide:nth-child(1)")
const slide2 = document.querySelector(".slide:nth-child(2)")
const slide3 = document.querySelector(".slide:nth-child(3)")
camera.position.z = 50
controls.zoomSpeed = -1
function makeLeft(){
    if(sliderNum == 2){
        slide2.style.display = "none"
        slide1.style.display = "block"
    }
    if(sliderNum == 3){
        slide3.style.display = "none"
        slide2.style.display = "block"
    }
    if(sliderNum > 1){
        sliderNum -= 1
    }

}

function makeRight(){
    if(sliderNum == 1){
        slide1.style.display = "none"
        slide2.style.display = "block"
    }
    if(sliderNum == 2){
        slide2.style.display = "none"
        slide3.style.display = "block"
    }
    if(sliderNum < 3){
        sliderNum += 1
    }
}
var obj
var loader = new GLTFLoader()
loader.load('1final.gltf', function (gltf){
            obj = gltf.scene
            obj.name = "one" 
            scene.add(obj)
            //console.log(obj)
            obj.position.x += getRandomInt(-25, 25)
            obj.position.z += getRandomInt(-25, 25)
            obj.position.y += 45
            loaded = 1
})

var obj1
var loader1 = new GLTFLoader()
loader1.load('0final.gltf', function (gltf){
            obj1 = gltf.scene
            obj1.name = "zero" 
            scene.add(obj1)
            //console.log(obj1)
            obj1.position.x += getRandomInt(-25, 25)
            obj1.position.z += getRandomInt(-25, 25)
            obj1.position.y += 45
            loaded1 = 1
})

const NUMBER_OF_ONES = 300
let i = 1

function makeOnes(){
    //console.log(loaded)
    if(i<NUMBER_OF_ONES && loaded == true){
        var name = "clone" + i
        var n = name
        //console.log(name)
        name = obj.clone()
        name.name = n
        //console.log(name)
        loadedClones.push(name)
        //console.log(loadedClones)
        //console.log(clone1)
        name.position.x += getRandomInt(randDepth, randWidth)
        name.position.z += getRandomInt(randDepth, randWidth)
        scene.add(name)
        i += 1
        //console.log('Success')
        }
}

function moveOnes(){
    loadedClones.forEach(function(element){
        var a = element.position.x
        var b = element.position.y
        if(camera.position.z <= 30){
            element.position.y -= .1
        }
        if(camera.position.z >= 30){
            element.position.y -= .3
        }
        if(element.position.y < -40){
            element.position.y += 80
        }
        /*if(mouse.x !== 0){
            if(mouse.x >= (element.position.x += .01) && a != (a += .1)){
                console.log("working")
                element.position.x += .1
            }
        }
        */
    })
}

const NUMBER_OF_ZEROS = 300
let z = 1

function makeZeros(){
    //console.log(loaded)
    if(z<NUMBER_OF_ZEROS && loaded1 == true){
        var name = "clone" + i
        var n = name
        //console.log(name)
        name = obj1.clone()
        name.name = n
        //console.log(name)
        loadedClones1.push(name)
        //console.log(clone1)
        name.position.x += getRandomInt(randDepth, randWidth)
        name.position.z += getRandomInt(randDepth, randWidth)
        scene.add(name)
        z += 1
        //console.log('Success')
        }
}

function moveZeros(){
    loadedClones1.forEach(function(element){
        if(camera.position.z <= 30){
            element.position.y -= .1
        }
        if(camera.position.z >= 30){
            element.position.y -= .3
        }
        if(element.position.y < -40){
            element.position.y += 80
        }
    })
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); 
}

function onWindowResize(){
    var height = first.clientHeight
    var width = first.clientWidth
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(devicePixelRatio)
    renderer.setSize(width, height)
}

function stopScroll(){
    if(camera.position.z < 30){
        controls.enableZoom = false
    }
}

function onMouseMove(event){
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = - (event.clientY / window.innerHeight) * 2 -1
}





function animate(){
    raycaster.setFromCamera(mouse, camera)
    makeOnes()
    moveOnes()
    makeZeros()
    moveZeros()
    stopScroll()
    controls.update()
    //console.log(plane.rotation.x)
    renderer.render(scene, camera)
    requestAnimationFrame(animate)
    
}

window.onbeforeunload = function () {
    window.scrollTo(0,0);
}
animate()
