console.log('main.js!');
const roomName = JSON.parse(document.getElementById('room-name').textContent);

let loc = window.location;
let wsStart = 'ws://';
if (loc.protocol == 'https:') {
  wsStart = 'wss://';
}
const chatSocket = new WebSocket(
  wsStart + window.location.host + '/ws/chat/' + roomName + '/'
);

const curUser = document.querySelector('#request-user-name').textContent
console.log(curUser)
// 각 클라이언트별로 좌표 저장
const drawingStates = {};

chatSocket.onmessage = function (e) {
  const data = JSON.parse(e.data);
  if (data['now'] == 'chat') {
    // 채팅을 수신한 경우
    console.log('채팅 수신');
    const chatLog = document.querySelector('#chat-log')
    chatLog.value +=
      data.user + ' : ' + data.message + '\n';
    // 채팅 스크롤 항상 최하단부로
    chatLog.scrollTop = chatLog.scrollHeight;
  } else if (
    data.now === 'draw' ||
    data.now === 'start' ||
    data.now === 'eraser' ||
    data.now === 'position'
  ) {
    // 그림, 마우스 위치 공유를 수신한 경우
    const clientId = data['user'];
    const { x, y } = data;
    const color = data['colorValue'];
    const size = data['sizeValue'];

    if (!(clientId in drawingStates)) {
      // 새로운 클라이언트의 좌표, 색 정보 생성
      drawingStates[clientId] = {
        lastX: x,
        lastY: y,
        positionEx: addPositionExElement(clientId),
        color: color,
        size: size,
      };

    } else {
      // 기존 클라이언트의 좌표 업데이트
      const {
        lastX,
        lastY,
        positionEx,
        color: clientColor,
        size: clientSize,
      } = drawingStates[clientId];

      if (data.now === 'start') {
        // 그림의 첫 좌표를 갱신
        drawingStates[clientId].lastX = x;
        drawingStates[clientId].lastY = y;
      } else if (data.now === 'draw' || data.now === 'eraser') {
        // 그림을 그림
        const canvas = document.getElementById('drawing-canvas');
        const context = canvas.getContext('2d');
        if (data.now === 'draw') {
          context.strokeStyle = color;
          context.lineWidth = size;
          context.beginPath();
          context.moveTo(lastX, lastY);
          context.lineTo(x, y);
          context.stroke();
        } else if (data.now === 'eraser') {
          context.strokeStyle = color;
          context.lineWidth = size;
          context.beginPath();
          context.moveTo(lastX, lastY);
          context.lineTo(x, y);
          context.stroke();
        } 

        // 상태 업데이트
        drawingStates[clientId].lastX = x;
        drawingStates[clientId].lastY = y;
      } else if (data.now === 'position') {
        if (curUser.trim() != clientId.trim()) {
          positionEx.style.display = 'block'
          positionEx.style.left = x + 'px';
          positionEx.style.top = y + 'px';
        }
      } 
    }
  } else if (data.now === 'eraseAll') {
    context.clearRect(0, 0, canvas.width, canvas.height);
  } else if (data.now === 'user_list') {
    // 유저 리스트를 수신한 경우
    userList = data.user_list; // 유저 목록 업데이트

    // 유저목록 업데이트
    updateUserList();
  } 
};

chatSocket.onclose = function (e) {
  console.error('Chat socket closed unexpectedly');
};

document.querySelector('#chat-message-input').focus();
document.querySelector('#chat-message-input').onkeyup = function (e) {
  if (e.keyCode === 13) {
    // keycode 13이 엔터를 뜻함
    document.querySelector('#chat-message-submit').click();
  }
};

document.querySelector('#chat-message-submit').onclick = function (e) {
  const messageInputDom = document.querySelector('#chat-message-input');
  const message = messageInputDom.value;

  // 서버에 보내는 데이터의 종류와 메시지 전송
  chatSocket.send(
    JSON.stringify({
      now: 'chat',
      message: message,
    })
  );
  messageInputDom.value = '';
};


/* 주기적으로 유저 접속여부 확인 (실패)
// 클라이언트의 연결 상태 확인
setInterval(() => {
  // Keep-alive 메시지를 서버로 보냄
  chatSocket.send(
    JSON.stringify({ 
      now: 'keep_alive',
    })
  );
}, 5000); // 5초마다 keep-alive 메시지 전송
*/

const canvas = document.getElementById('drawing-canvas');
const context = canvas.getContext('2d');
const eraseAllBtn = document.getElementById('erase-all');
const colorControl = document.querySelector('.control');
const sizeControl = document.querySelector('.sizeControl');
const pencilMode = document.querySelector('.pencil-mode');
const positionEx = document.querySelector('.position-ex')
const userContainer = document.querySelector('.user-list');

context.lineCap = 'round';
// context.lineWidth ? size
context.lineWidth = 5;

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let colorValue = 'black'; // 색상
let sizeValue = 5; // 두께
let drawMode = 1; //1이 연필, 0이 지우개, 기본값 1
let lastColor = 'black'; // 지우개에서 연필 선택할 때 색 되돌리기
let userList = []; // 유저 목록을 저장하는 배열


canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);
colorControl.addEventListener('click', setColor);
sizeControl.addEventListener('click', setSize);
eraseAllBtn.addEventListener('click', eraseAll);
pencilMode.addEventListener('click', setPencilMode);

function startDrawing(e) {
  isDrawing = true;
  [lastX, lastY] = [e.offsetX, e.offsetY];
  console.log(lastX, lastY)
  // 클라이언트별 시작 좌표를 갱신해주기 위해 시작점 따로 전송
  chatSocket.send(
    JSON.stringify({
      now: 'start',
      x: lastX,
      y: lastY,
    })
  );
}


// 유저 목록 업데이트
function updateUserList() {
  const userContainer = document.querySelector('.user-list ul');
  userContainer.innerHTML = ''; // 기존 유저 목록 초기화

  for (const user of userList) {
    const userItem = document.createElement('li');
    const userName = document.createElement('p');
    userName.className = 'user-name';
    userName.textContent = user; 
    const authorizationBtn = document.createElement('button');
    authorizationBtn.className = 'authorization-btn';
    // 버튼에 원하는 내용 설정
    authorizationBtn.textContent = 'Authorize';

    // 버튼 클릭 이벤트 핸들러 추가
    authorizationBtn.addEventListener('click', () => {
      authorizePresenter(user); // 발표자 권한 변경 요청 함수 호출
    });

    userItem.appendChild(userName);
    userItem.appendChild(authorizationBtn);
    userContainer.appendChild(userItem);
  }
}

// 권한 부여 메시지
function authorizePresenter(userId) {
  chatSocket.send(
    JSON.stringify({
      now: 'authorize_presenter',
      userId: userId,
    })
  );
}


function draw(e) {
  const mouseX = e.pageX;
  const mouseY = e.pageY;
  chatSocket.send(
    JSON.stringify({
      now: 'position',
      x: mouseX,
      y: mouseY,
    })
  );
  if (!isDrawing) return;
  const [x, y] = [e.offsetX, e.offsetY];

  if (drawMode) {
    // 연필모드
    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(x, y);
    context.stroke();
    [lastX, lastY] = [e.offsetX, e.offsetY];
  } else {
    // 지우개모드
    context.beginPath();
    // 배경색으로 칠하기
    colorValue = "#eee"
    context.strokeStyle = colorValue
    context.moveTo(lastX, lastY);
    context.lineTo(x, y);
    context.stroke();
    [lastX, lastY] = [e.offsetX, e.offsetY];
  }
    // 그림 모드, 좌표, 두께정보 서버로 전송
    chatSocket.send(
    JSON.stringify({
      now: drawMode ? 'draw' : 'eraser',
      x: x,
      y: y,
      colorValue: colorValue,
      sizeValue: sizeValue,
    })
  );
}

function stopDrawing() {
  // mouseout 시에 마우스 위치 공유 사라지게
  // positionEx.style.display = 'none'
  isDrawing = false;
}

function eraseAll() {
  // 0,0 부터 canvas의 width, height 까지 모두 지움
  context.clearRect(0, 0, canvas.width, canvas.height);

  chatSocket.send(
    JSON.stringify({
      now: 'eraseAll',
    })
  );
}

function setColor(e) {
  colorValue = e.target.getAttribute('data-color');
  context.strokeStyle = colorValue;
  drawMode = 1
}

function setSize(e) {
  sizeValue = e.target.getAttribute('data-size');
  context.lineWidth = sizeValue;
}

function setPencilMode(e) {
  pencilValue = e.target.getAttribute('data-pencil');
  drawMode = Number(pencilValue);
  if ( drawMode ) {
    colorValue = lastColor
  } else {
    lastColor = colorValue
  }
  console.log('drawMode: ', drawMode, typeof drawMode);
}

function addPositionExElement(clientId) {
  const positionEx = document.createElement('div');
  positionEx.className = 'position-ex';
  positionEx.id = `position-ex-${clientId}`;
  positionEx.style.backgroundColor = getClientColor(clientId); // 클라이언트별로 다른 배경색 설정

  const clientIdElement = document.createElement('span');
  clientIdElement.className = 'client-id';
  clientIdElement.textContent = clientId;

  positionEx.appendChild(clientIdElement);
  document.body.appendChild(positionEx);

  return positionEx;
}

// function getClientColor(clientId) {
//   let sum = 0;
//   for (let i = 0; i < clientId.length; i++) {
//     sum += clientId.charCodeAt(i);
//   }
//   const hue = sum % 360; // 유저 이름의 합산 값을 360으로 나눈 나머지를 색상 hue로 사용
//   return `hsl(${hue}, 100%, 50%)`;
// }

function getClientColor(clientId) {
  const hue = Math.floor(Math.random() * 360); // 0부터 360 사이의 랜덤한 hue 값 생성
  return `hsl(${hue}, 100%, 50%)`;
}
