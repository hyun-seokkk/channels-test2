console.log('main.js!')
const roomName = JSON.parse(document.getElementById('room-name').textContent);

let loc = window.location
let wsStart = 'ws://'
if(loc.protocol == 'https:'){
  wsStart = 'wss://'
}
const chatSocket = new WebSocket(
    wsStart
    + window.location.host
    + '/ws/chat/'
    + roomName
    + '/'
);

// 각 클라이언트별로 좌표 저장
const drawingStates = {};

chatSocket.onmessage = function(e) {
    const data = JSON.parse(e.data);
    if (data['now'] == 'chat') {  
        // 채팅을 수신한 경우
        console.log('채팅 수신')
        document.querySelector('#chat-log').value += (data.user + ' : ' + data.message + '\n');
    } else if (data.now === 'draw' || data.now === 'start') {
        // 그림을 수신한 경우

        const clientId = data['user']
        const { x, y } = data

        if (!(clientId in drawingStates)) {
            // 새로운 클라이언트의 좌표 생성
            drawingStates[clientId] = {
                lastX: x,
                lastY: y
            }
        } else {
            // 기존 클라이언트의 좌표 업데이트
            const { lastX, lastY } = drawingStates[clientId];

            if (data.now === 'start') {
                // 그림의 첫 좌표를 갱신
                drawingStates[clientId].lastX = x;
                drawingStates[clientId].lastY = y;
            } else if (data.now === 'draw') {
                // 그림을 그림
                const canvas = document.getElementById('drawing-canvas');
                const context = canvas.getContext('2d');

                context.beginPath();
                context.moveTo(lastX, lastY);
                context.lineTo(x, y);
                context.stroke();

                // 상태 업데이트
                drawingStates[clientId].lastX = x;
                drawingStates[clientId].lastY = y;
            }
        }
    } else if (data.now === 'eraseAll') {
        context.clearRect(0, 0, canvas.width, canvas.height)
    }
}

chatSocket.onclose = function(e) {
    console.error('Chat socket closed unexpectedly');
};

document.querySelector('#chat-message-input').focus();
document.querySelector('#chat-message-input').onkeyup = function(e) {
    if (e.keyCode === 13) {  // keycode 13이 엔터를 뜻함
        document.querySelector('#chat-message-submit').click();
    }
};

document.querySelector('#chat-message-submit').onclick = function(e) {
    const messageInputDom = document.querySelector('#chat-message-input');
    const message = messageInputDom.value;

    // 서버에 보내는 데이터의 종류와 메시지 전송
    chatSocket.send(JSON.stringify({
        'now' : 'chat',
        'message': message,
    }));
    messageInputDom.value = '';
};

const canvas = document.getElementById('drawing-canvas');
const context = canvas.getContext('2d');
const eraseAllBtn = document.getElementById('erase-all')
const colorControl = document.querySelector('.control')
const pencilMode = document.querySelector('.pencil-mode')
console.log(pencilMode)

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let colorValue = 'black'; // 색상
let drawMode = 1  //1이 연필, 0이 지우개, 기본값 1



canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);
colorControl.addEventListener('click', setColor);
eraseAllBtn.addEventListener('click', eraseAll);
pencilMode.addEventListener('click', setPencilMode);

function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];

    // 클라이언트별 시작 좌표를 갱신해주기 위해 시작점 따로 전송
    chatSocket.send(JSON.stringify({
        'now': 'start',
        'x': lastX,
        'y': lastY,
    }))
}


function draw(e) {
    if (!isDrawing) return;
    
    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(e.offsetX, e.offsetY);
    context.stroke();
    [lastX, lastY] = [e.offsetX, e.offsetY];
    
    // 현재 마우스 좌표 전송
    chatSocket.send(JSON.stringify({
        'now': 'draw',
        'x': e.offsetX,
        'y': e.offsetY,
        //'client_name': userName,
    }))
}

function stopDrawing() {
    isDrawing = false;
}

function eraseAll() {
    // 0,0 부터 canvas의 width, height 까지 모두 지움
    context.clearRect(0, 0, canvas.width, canvas.height)

    chatSocket.send(JSON.stringify({
        'now' : 'eraseAll'
    }))
}

function setColor(e) {
    colorValue = e.target.getAttribute('data-color')
    context.strokeStyle = colorValue;
    context.lineWidth = 5;
    
    console.log(colorValue)
}

function setPencilMode(e) {
  pencilValue = e.target.getAttribute('data-pencil')
  drawMode = Number(pencilValue)
  console.log('drawMode: ', drawMode, typeof(drawMode))
}