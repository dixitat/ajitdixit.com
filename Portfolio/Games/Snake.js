// snakeGame.js
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('scoreDisplay');
const startButton = document.getElementById('startButton');
const gameContainer = document.getElementById('gameContainer');

let gridSize = 20;
let snake = [{x: 10, y: 10}, {x: 9, y: 10}];
let food = {x: 0, y: 0, type: 'red'};
let greenApple = null;
let dx = 1;
let dy = 0;
let score = 0;
let level = 1;
let baseSpeed = 120; // Slower start
let gameStarted = false;
let snakeWidth = gridSize * 0.4; // Decreased from 0.6
let portal = null;
let obstacles = [];
let gameTime = 0;
let greenAppleTimer = 0;
let applesNeededForPortal = 10;

// Set initial canvas size
canvas.width = 400;
canvas.height = 400;

// Background color variables
let baseBackgroundColor = { r: 0, g: 0, b: 0 }; // Light pink (#FFB6C1) in RGB
const darkeningFactor = 0.95; // Darkens by 5% per level
const darknessThreshold = 50; // Reset when any RGB component drops below 50

function generateRandomColor() {
    return '#FFD700'; // Gold for border
}

function getRandomLightColor() {
    // Generate a random light color (RGB values between 150 and 255)
    return {
        r: Math.floor(Math.random() * 106) + 150,
        g: Math.floor(Math.random() * 106) + 150,
        b: Math.floor(Math.random() * 106) + 150
    };
}

function getBackgroundColor(level) {
    let r = baseBackgroundColor.r;
    let g = baseBackgroundColor.g;
    let b = baseBackgroundColor.b;
    const factor = Math.pow(darkeningFactor, level - 1);
    r = Math.max(0, Math.floor(r * factor));
    g = Math.max(0, Math.floor(g * factor));
    b = Math.max(0, Math.floor(b * factor));

    // Check if too dark and reset base color if necessary
    if (r < darknessThreshold || g < darknessThreshold || b < darknessThreshold) {
        baseBackgroundColor = getRandomLightColor();
        r = baseBackgroundColor.r;
        g = baseBackgroundColor.g;
        b = baseBackgroundColor.b;
    }

    return `rgb(${r}, ${g}, ${b})`;
}

function generateFood() {
    food = {
        x: Math.floor(Math.random() * (canvas.width / gridSize)),
        y: Math.floor(Math.random() * (canvas.height / gridSize)),
        type: 'red'
    };
    while (obstacles.some(obs => obs.x === food.x && obs.y === food.y)) {
        food = {
            x: Math.floor(Math.random() * (canvas.width / gridSize)),
            y: Math.floor(Math.random() * (canvas.height / gridSize)),
            type: 'red'
        };
    }
    checkFoodOverlap();
}

function generateGreenApple() {
    if (!greenApple && Math.random() < 0.1 && gameStarted) {
        greenApple = {
            x: Math.floor(Math.random() * (canvas.width / gridSize)),
            y: Math.floor(Math.random() * (canvas.height / gridSize)),
            type: 'green',
            points: Math.floor(Math.random() * 4) + 2,
            timer: Math.floor(Math.random() * 6) + 5
        };
        while (obstacles.some(obs => obs.x === greenApple.x && obs.y === greenApple.y)) {
            greenApple = {
                x: Math.floor(Math.random() * (canvas.width / gridSize)),
                y: Math.floor(Math.random() * (canvas.height / gridSize)),
                type: 'green',
                points: Math.floor(Math.random() * 4) + 2,
                timer: Math.floor(Math.random() * 6) + 5
            };
        }
        checkGreenAppleOverlap();
    }
}

function checkFoodOverlap() {
    for (let segment of snake) {
        if (segment.x === food.x && segment.y === food.y) { generateFood(); return; }
    }
    if (portal && portal.x === food.x && portal.y === food.y) { generateFood(); }
}

function checkGreenAppleOverlap() {
    if (!greenApple) return;
    for (let segment of snake) {
        if (segment.x === greenApple.x && segment.y === greenApple.y) { generateGreenApple(); return; }
    }
    if (food.x === greenApple.x && food.y === greenApple.y) { generateGreenApple(); return; }
    if (portal && portal.x === greenApple.x && portal.y === greenApple.y) { generateGreenApple(); }
}

function generatePortal() {
    if (score >= applesNeededForPortal && !portal) {
        portal = {
            x: Math.floor(Math.random() * (canvas.width / gridSize)),
            y: Math.floor(Math.random() * (canvas.height / gridSize))
        };
        while (
            snake.some(s => s.x === portal.x && s.y === portal.y) ||
            (food.x === portal.x && food.y === food.y) ||
            (obstacles.some(o => o.x === portal.x && o.y === portal.y)) ||
            (greenApple && greenApple.x === portal.x && greenApple.y === portal.y)
        ) {
            portal = {
                x: Math.floor(Math.random() * (canvas.width / gridSize)),
                y: Math.floor(Math.random() * (canvas.height / gridSize))
            };
        }
        gameContainer.classList.add('level-available');
    }
}

function generateObstacles() {
    obstacles = [];
    if (level > 1) {
        const numObstacles = level - 1; // 1 obstacle at level 2, then +1 per level
        for (let i = 0; i < numObstacles; i++) {
            const length = Math.floor(Math.random() * 4) + 1;
            const isHorizontal = Math.random() < 0.5;
            let obsX = Math.floor(Math.random() * (canvas.width / gridSize - (isHorizontal ? length - 1 : 0)));
            let obsY = Math.floor(Math.random() * (canvas.height / gridSize - (isHorizontal ? 0 : length - 1)));
            let newObstacles = [];
            
            for (let j = 0; j < length; j++) {
                let obs = {
                    x: isHorizontal ? obsX + j : obsX,
                    y: isHorizontal ? obsY : obsY + j
                };
                if (
                    !snake.some(s => s.x === obs.x && s.y === obs.y) &&
                    !(food.x === obs.x && food.y === obs.y) &&
                    !(greenApple && greenApple.x === obs.x && greenApple.y === obs.y) &&
                    !(portal && portal.x === obs.x && portal.y === obs.y) &&
                    !obstacles.some(o => o.x === obs.x && o.y === obs.y)
                ) {
                    newObstacles.push(obs);
                } else {
                    newObstacles = [];
                    break;
                }
            }
            if (newObstacles.length === length) obstacles.push(...newObstacles);
            else i--; // Retry if placement fails
        }
    }
}

function gameLoop() {
    if (!gameStarted) return;
    
    setTimeout(() => {
        moveSnake();
        if (checkCollision()) {
            alert('Game Over! Level: ' + level + ' Apples: ' + score);
            document.location.reload();
            return;
        }
        draw();
        gameTime += baseSpeed / 1000;
        if (greenApple) {
            greenAppleTimer += baseSpeed / 1000;
            if (greenAppleTimer >= greenApple.timer) {
                greenApple = null;
                greenAppleTimer = 0;
            }
        }
        generateGreenApple();
        generatePortal();
        gameLoop();
    }, baseSpeed * Math.pow(0.95, level - 1));
}

function draw() {
    ctx.fillStyle = getBackgroundColor(level); // Static darkening with reset
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#FFD700'; // Gold obstacles
    obstacles.forEach(obs => {
        ctx.fillRect(obs.x * gridSize, obs.y * gridSize, gridSize, gridSize);
    });

    snakeWidth = gridSize * 0.4; // Decreased width
    ctx.lineWidth = snakeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0000FF';
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(39, 110, 71, 0.5)';
    ctx.beginPath();
    snake.forEach((segment, index) => {
        const x = segment.x * gridSize + gridSize/2;
        const y = segment.y * gridSize + gridSize/2;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        if (index === 0) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            const size = gridSize / 2;
            if (dx === 1) {
                ctx.moveTo(x + size, y);
                ctx.lineTo(x - size/2, y - size);
                ctx.lineTo(x - size/2, y + size);
            } else if (dx === -1) {
                ctx.moveTo(x - size, y);
                ctx.lineTo(x + size/2, y - size);
                ctx.lineTo(x + size/2, y + size);
            } else if (dy === -1) {
                ctx.moveTo(x, y - size);
                ctx.lineTo(x - size, y + size/2);
                ctx.lineTo(x + size, y + size/2);
            } else if (dy === 1) {
                ctx.moveTo(x, y + size);
                ctx.lineTo(x - size, y - size/2);
                ctx.lineTo(x + size, y - size/2);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#000000';
            const eyeSize = gridSize / 10;
            if (dx === 1) {
                ctx.fillRect(x + size/2, y - size/2, eyeSize, eyeSize);
                ctx.fillRect(x + size/2, y + size/2, eyeSize, eyeSize);
            } else if (dx === -1) {
                ctx.fillRect(x - size/2 - eyeSize, y - size/2, eyeSize, eyeSize);
                ctx.fillRect(x - size/2 - eyeSize, y + size/2, eyeSize, eyeSize);
            } else if (dy === -1) {
                ctx.fillRect(x - size/2, y - size/2 - eyeSize, eyeSize, eyeSize);
                ctx.fillRect(x + size/2, y - size/2 - eyeSize, eyeSize, eyeSize);
            } else if (dy === 1) {
                ctx.fillRect(x - size/2, y + size/2, eyeSize, eyeSize);
                ctx.fillRect(x + size/2, y + size/2, eyeSize, eyeSize);
            }
        }
    });
    ctx.stroke();

    if (portal) {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(portal.x * gridSize + gridSize/2, portal.y * gridSize + gridSize/2, gridSize/2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.fillStyle = '#9d1e3d';
    ctx.beginPath();
    ctx.arc(food.x * gridSize + gridSize/2, food.y * gridSize + gridSize/2, gridSize/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#276e47';
    ctx.beginPath();
    ctx.moveTo(food.x * gridSize + gridSize/2, food.y * gridSize + gridSize/4);
    ctx.quadraticCurveTo(food.x * gridSize + gridSize/2, food.y * gridSize, food.x * gridSize + gridSize/1.5, food.y * gridSize + gridSize/4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(food.x * gridSize + gridSize/2 - 4, food.y * gridSize + gridSize/2 - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    if (greenApple) {
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.arc(greenApple.x * gridSize + gridSize/2, greenApple.y * gridSize + gridSize/2, gridSize/2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#228B22';
        ctx.beginPath();
        ctx.moveTo(greenApple.x * gridSize + gridSize/2, greenApple.y * gridSize + gridSize/4);
        ctx.quadraticCurveTo(greenApple.x * gridSize + gridSize/2, greenApple.y * gridSize, greenApple.x * gridSize + gridSize/1.5, greenApple.y * gridSize + gridSize/4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(greenApple.x * gridSize + gridSize/2 - 4, greenApple.y * gridSize + gridSize/2 - 4, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;
    scoreDisplay.textContent = `Level: ${level} | Apples: ${score} | Time: ${Math.floor(gameTime)}s`;
}

function moveSnake() {
    const head = {x: snake[0].x + dx, y: snake[0].y + dy};
    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score += 1;
        generateFood();
    } else if (greenApple && head.x === greenApple.x && head.y === greenApple.y) {
        score += greenApple.points;
        greenApple = null;
        greenAppleTimer = 0;
    } else if (portal && head.x === portal.x && head.y === portal.y) {
        level += 1;
        portal = null;
        applesNeededForPortal += 10;
        gameContainer.classList.remove('level-available');
        gameContainer.style.borderColor = generateRandomColor();
        generateObstacles();
        generateFood();
        if (greenApple) greenApple = null;
        greenAppleTimer = 0;
        snake.pop();
    } else {
        snake.pop();
    }
}

function checkCollision() {
    const head = snake[0];
    if (head.x < 0 || head.x >= canvas.width / gridSize || head.y < 0 || head.y >= canvas.height / gridSize) return true;
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) return true;
    }
    for (let obs of obstacles) {
        if (head.x === obs.x && head.y === obs.y) return true;
    }
    return false;
}

document.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
    }
    if (!gameStarted) return;
    switch (event.key) {
        case 'ArrowUp': if (dy === 0) { dx = 0; dy = -1; } break;
        case 'ArrowDown': if (dy === 0) { dx = 0; dy = 1; } break;
        case 'ArrowLeft': if (dx === 0) { dx = -1; dy = 0; } break;
        case 'ArrowRight': if (dx === 0) { dx = 1; dy = 0; } break;
    }
});

startButton.addEventListener('click', () => {
    if (!gameStarted) {
        gameStarted = true;
        startButton.style.display = 'none';
        draw();
        gameLoop();
    }
});

generateFood();
draw();