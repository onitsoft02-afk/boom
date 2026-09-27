const boardElement = document.getElementById('game-board');
const difficultySelect = document.getElementById('difficulty-select');
const minesCountElement = document.getElementById('mines-count');
const timerElement = document.getElementById('timer');
const scoreElement = document.getElementById('score');
const resetBtn = document.getElementById('reset-btn');
const faceIcon = document.getElementById('face-icon');

// --- Sounds ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playClickSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function playWinSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const startTime = audioCtx.currentTime + i * 0.15;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0, startTime + 0.15);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.15);
    });
}

function playLoseSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 1);
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1);
}

const DIFFICULTIES = {
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    advanced: { rows: 24, cols: 24, mines: 99 }
};

const SPECIAL_PATTERNS = [
    {
        name: "2-4-6 (Multiples of 2)",
        width: 5, height: 3,
        mines: [[0, 2], [0, 3], [0, 4], [1, 4], [2, 2], [2, 3]]
    },
    {
        name: "1-2-3",
        width: 5, height: 3,
        mines: [[0, 0], [0, 3], [2, 3], [1, 4]]
    },
    {
        name: "1-2-1-2",
        width: 6, height: 3,
        mines: [[0, 1], [2, 3], [0, 5]]
    }
];

let currentDifficulty = 'beginner';
let rows, cols, totalMines;
let board = [];
let isFirstClick = true;
let isGameOver = false;
let flagsPlaced = 0;
let cellsRevealed = 0;
let timerInterval = null;
let secondsElapsed = 0;
let score = 0;

function initGame() {
    const config = DIFFICULTIES[currentDifficulty];
    rows = config.rows;
    cols = config.cols;
    totalMines = config.mines;
    
    board = [];
    isFirstClick = true;
    isGameOver = false;
    flagsPlaced = 0;
    cellsRevealed = 0;
    secondsElapsed = 0;
    score = 0;
    
    clearInterval(timerInterval);
    updateTimerDisplay();
    updateMinesDisplay();
    updateScoreDisplay();
    faceIcon.textContent = '😊';
    
    renderBoard();
}

function renderBoard() {
    boardElement.innerHTML = '';
    // dynamically set grid columns
    boardElement.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
    
    for (let r = 0; r < rows; r++) {
        const rowArray = [];
        for (let c = 0; c < cols; c++) {
            const cellElement = document.createElement('div');
            cellElement.classList.add('cell');
            cellElement.dataset.row = r;
            cellElement.dataset.col = c;
            
            cellElement.addEventListener('click', () => handleLeftClick(r, c));
            cellElement.addEventListener('contextmenu', (e) => handleRightClick(e, r, c));
            cellElement.addEventListener('mousedown', (e) => {
                if (!isGameOver && e.button === 0) faceIcon.textContent = '😮';
            });
            cellElement.addEventListener('mouseup', () => {
                if (!isGameOver) faceIcon.textContent = '😊';
            });
            cellElement.addEventListener('mouseleave', () => {
                if (!isGameOver) faceIcon.textContent = '😊';
            });

            boardElement.appendChild(cellElement);
            
            rowArray.push({
                element: cellElement,
                isMine: false,
                isRevealed: false,
                isFlagged: false,
                neighborMines: 0,
                reserved: false
            });
        }
        board.push(rowArray);
    }
}

function placeMines(firstRow, firstCol) {
    let minesPlaced = 0;
    const patternType = Math.floor(Math.random() * 3); // 0: Random, 1: Clustered, 2: Spread
    const placedMineCoords = [];

    // --- Inject Special Patterns ---
    const numPatternsToInject = currentDifficulty === 'beginner' ? 1 : 2;
    for (let p = 0; p < numPatternsToInject; p++) {
        const pattern = SPECIAL_PATTERNS[Math.floor(Math.random() * SPECIAL_PATTERNS.length)];
        for (let attempt = 0; attempt < 50; attempt++) {
            const startR = Math.floor(Math.random() * (rows - pattern.height));
            const startC = Math.floor(Math.random() * (cols - pattern.width));
            
            let canPlace = true;
            for (let r = startR - 1; r <= startR + pattern.height; r++) {
                for (let c = startC - 1; c <= startC + pattern.width; c++) {
                    if (r >= 0 && r < rows && c >= 0 && c < cols) {
                        const isNearFirstClick = Math.abs(r - firstRow) <= 2 && Math.abs(c - firstCol) <= 2;
                        if (board[r][c].reserved || board[r][c].isMine || isNearFirstClick) {
                            canPlace = false;
                            break;
                        }
                    }
                }
                if (!canPlace) break;
            }
            
            if (canPlace) {
                // Reserve bounding box
                for (let r = startR - 1; r <= startR + pattern.height; r++) {
                    for (let c = startC - 1; c <= startC + pattern.width; c++) {
                        if (r >= 0 && r < rows && c >= 0 && c < cols) {
                            board[r][c].reserved = true;
                        }
                    }
                }
                // Place mines
                for (let [dr, dc] of pattern.mines) {
                    board[startR + dr][startC + dc].isMine = true;
                    placedMineCoords.push({r: startR + dr, c: startC + dc});
                    minesPlaced++;
                }
                break;
            }
        }
    }

    while (minesPlaced < totalMines) {
        let r, c;
        if (patternType === 0 || placedMineCoords.length === 0) {
            // Standard Random
            r = Math.floor(Math.random() * rows);
            c = Math.floor(Math.random() * cols);
        } else if (patternType === 1) {
            // Clustered
            if (Math.random() < 0.2) {
                // 20% chance to start new cluster
                r = Math.floor(Math.random() * rows);
                c = Math.floor(Math.random() * cols);
            } else {
                // 80% chance to pick near an existing mine
                const anchor = placedMineCoords[Math.floor(Math.random() * placedMineCoords.length)];
                r = anchor.r + Math.floor(Math.random() * 5) - 2;
                c = anchor.c + Math.floor(Math.random() * 5) - 2;
                r = Math.max(0, Math.min(rows - 1, r));
                c = Math.max(0, Math.min(cols - 1, c));
            }
        } else if (patternType === 2) {
            // Spread
            let bestR, bestC, minScore = 999;
            for (let i = 0; i < 3; i++) {
                let tr = Math.floor(Math.random() * rows);
                let tc = Math.floor(Math.random() * cols);
                let nearby = 0;
                for (let mr = tr - 2; mr <= tr + 2; mr++) {
                    for (let mc = tc - 2; mc <= tc + 2; mc++) {
                        if (mr >= 0 && mr < rows && mc >= 0 && mc < cols && board[mr][mc].isMine) {
                            nearby++;
                        }
                    }
                }
                if (nearby < minScore) {
                    minScore = nearby;
                    bestR = tr;
                    bestC = tc;
                }
            }
            r = bestR;
            c = bestC;
        }
        
        // Prevent placing mine on first click and its 8 neighbors for a safe start
        const isNearFirstClick = Math.abs(r - firstRow) <= 1 && Math.abs(c - firstCol) <= 1;

        if (!board[r][c].isMine && !isNearFirstClick && !board[r][c].reserved) {
            board[r][c].isMine = true;
            placedMineCoords.push({r, c});
            minesPlaced++;
        }
    }
    calculateNeighborMines();
}

function calculateNeighborMines() {
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c].isMine) continue;
            
            let count = 0;
            for (let [dr, dc] of directions) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].isMine) {
                    count++;
                }
            }
            board[r][c].neighborMines = count;
        }
    }
}

function handleLeftClick(r, c) {
    if (isGameOver || board[r][c].isRevealed || board[r][c].isFlagged) return;

    playClickSound();

    if (isFirstClick) {
        isFirstClick = false;
        placeMines(r, c);
        startTimer();
    }

    revealCell(r, c);
    checkWinCondition();
}

function handleRightClick(e, r, c) {
    e.preventDefault();
    if (isGameOver || board[r][c].isRevealed) return;

    playClickSound();

    const cell = board[r][c];
    if (!cell.isFlagged && flagsPlaced < totalMines) {
        cell.isFlagged = true;
        cell.element.textContent = '🚩';
        flagsPlaced++;
    } else if (cell.isFlagged) {
        cell.isFlagged = false;
        cell.element.textContent = '';
        flagsPlaced--;
    }
    updateMinesDisplay();
}

function revealCell(r, c) {
    const cell = board[r][c];
    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true;
    cell.element.classList.add('revealed');
    cellsRevealed++;

    if (!cell.isMine) {
        score += 10;
        updateScoreDisplay();
    }

    if (cell.isMine) {
        handleGameOver(false);
        cell.element.classList.add('mine');
        cell.element.textContent = '💣';
        return;
    }

    if (cell.neighborMines > 0) {
        cell.element.textContent = cell.neighborMines;
        cell.element.dataset.value = cell.neighborMines;
    } else {
        // Flood fill for 0 neighbor mines
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];
        
        for (let [dr, dc] of directions) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                revealCell(nr, nc);
            }
        }
    }
}

function handleGameOver(win) {
    isGameOver = true;
    clearInterval(timerInterval);
    
    if (win) {
        playWinSound();
    } else {
        playLoseSound();
    }
    
    faceIcon.textContent = win ? '😎' : '😵';
    
    // Reveal all mines if lost
    if (!win) {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = board[r][c];
                if (cell.isMine && !cell.isFlagged) {
                    cell.element.classList.add('revealed');
                    cell.element.textContent = '💣';
                } else if (!cell.isMine && cell.isFlagged) {
                    cell.element.textContent = '❌'; // Wrong flag
                }
            }
        }
    }
}

function checkWinCondition() {
    if (cellsRevealed === (rows * cols) - totalMines) {
        // Time bonus
        const timeBonus = Math.max(0, 1000 - secondsElapsed * 2);
        score += timeBonus;
        updateScoreDisplay();
        handleGameOver(true);
    }
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (secondsElapsed < 999) {
            secondsElapsed++;
            updateTimerDisplay();
        }
    }, 1000);
}

function updateTimerDisplay() {
    timerElement.textContent = secondsElapsed.toString().padStart(3, '0');
}

function updateMinesDisplay() {
    const remainingMines = totalMines - flagsPlaced;
    minesCountElement.textContent = remainingMines.toString().padStart(3, '0');
}

function updateScoreDisplay() {
    scoreElement.textContent = score.toString().padStart(4, '0');
}

// Event Listeners
difficultySelect.addEventListener('change', (e) => {
    currentDifficulty = e.target.value;
    initGame();
});

resetBtn.addEventListener('click', initGame);

// Prevent default context menu on the board
boardElement.addEventListener('contextmenu', e => e.preventDefault());

// Initialize game on load
initGame();
