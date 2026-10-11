const canvas = document.getElementById("orb")
const ctx = canvas.getContext("2d")

ctx.beginPath()
ctx.arc(250,250,80,0,Math.PI*2)
ctx.fillStyle = "blueviolet"
ctx.fill()