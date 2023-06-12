console.log('main.js!');
const roomName = JSON.parse(document.getElementById('room-name').textContent);

const btnJoin = document.getElementById('join-btn')
const curUser = document.querySelector('#request-user-name').textContent
console.log(curUser)

let chatSocket

// 각 클라이언트별로 좌표 저장
const drawingStates = {};

// RTC peer 리스트
const mapPeers = {}

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

// 비동기 in promise를 위한 방 입장 버튼
btnJoin.addEventListener('click', (e) => {
  btnJoin.parentNode.removeChild(btnJoin)

  document.querySelector('main').hidden = false

  let loc = window.location;
  let wsStart = 'ws://';
  if (loc.protocol == 'https:') {
    wsStart = 'wss://';
  }
  chatSocket = new WebSocket(
    wsStart + window.location.host + '/ws/chat/' + roomName + '/'
  );

  chatSocket.addEventListener('open', (e) => {
    console.log('Connection opened!')
    chatSocket.send(
      JSON.stringify({
        'now': 'new-peer',
        'message': {},
      })
    )

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    colorControl.addEventListener('click', setColor);
    sizeControl.addEventListener('click', setSize);
    eraseAllBtn.addEventListener('click', eraseAll);
    pencilMode.addEventListener('click', setPencilMode);
  })
  chatSocket.addEventListener('message', chatSocketOnMessage)
  chatSocket.addEventListener('close', (e) => {
    console.error('Chat socket closed');
  });
  chatSocket.addEventListener('error', (e) => {
    console.error('Chat socket closed unexpectedly');
  });
})

function chatSocketOnMessage(e) {
  const data = JSON.parse(e.data);
  if (data['now'] == 'chat') {
    // 채팅을 수신한 경우
    console.log('채팅 수신');
    document.querySelector('#chat-log').value +=
      data.user + ' : ' + data.message + '\n';
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
  } else if (
    data.now === 'new-peer'   ||
    data.now === 'new-offer'  ||
    data.now === 'new-answer'
  ) {
    // RTC Peer Connection 파트
    const peerUsername = data.user
    const receiver_channel_name = data.message.receiver_channel_name

    if (curUser == peerUsername) {
      return
    }
    
    if (data.now === 'new-peer') {
      console.log('new-peer action!')
      
      createOfferer(peerUsername, receiver_channel_name)

      return
    } else if (data.now === 'new-offer') {
      console.log('new-offer action!')
      
      const offer = data.message.sdp
      
      createAnswerer(offer, peerUsername, receiver_channel_name)

      return
    } else if (data.now === 'new-answer') {
      console.log('new-answer action!')
      
      const answer = data.message.sdp
      const peer = mapPeers[peerUsername][0]
      
      peer.setRemoteDescription(answer)
      .then(() => {
          console.log('[setRemoteDescription(answer)] peer : ', peer)
          console.log('[setRemoteDescription(answer)] answer : ', answer)
        })
        .catch((error) => {
          // 문제 발생 코드
          // DOMException: Failed to execute 'setRemoteDescription' on 'RTCPeerConnection': 
          // Failed to set remote answer sdp: Called in wrong state: stable
          console.error('setRemoteDescription(answer) : ', error)
        })

        return
    }
  }
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

function startDrawing(e) {
  console.log('startDrawing')
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

function draw(e) {
  console.log('draw')
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
  console.log('stopDrawing')
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


// Local Media Stream 생성
let localStream = new MediaStream()
const localVideo = document.getElementById('local-video')

const constraints = {
  'video': true,
  'audio': true
}

const btnToggleAudio = document.getElementById('btn-toggle-audio')
const btnToggleVideo = document.getElementById('btn-toggle-video')

const userMedia = navigator.mediaDevices.getUserMedia(constraints)
.then(stream => {
  localStream = stream
  localVideo.srcObject = localStream
  localVideo.muted = true

  const audioTracks = stream.getAudioTracks()
  const videoTracks = stream.getVideoTracks()

  audioTracks[0].enabled = false
  videoTracks[0].enabled = false

  btnToggleAudio.addEventListener('click', () => {
    audioTracks[0].enabled = !audioTracks[0].enabled

    if(audioTracks[0].enabled) {
      btnToggleAudio.textContent = 'Audio Mute'
    } else {
      btnToggleAudio.textContent = 'Audio Unmute'
    }
  })

  btnToggleVideo.addEventListener('click', () => {
    videoTracks[0].enabled = !videoTracks[0].enabled

    if(videoTracks[0].enabled) {
      btnToggleVideo.textContent = 'Video Off'
    } else {
      btnToggleVideo.textContent = 'Video On'
    }
  })
})
.catch((error) => {
  console.log('Error accessing media devices.')
})

// RTC Peer Connection 
function createOfferer(peerUsername, receiver_channel_name) {
  const peer = new RTCPeerConnection(null)

  addLocalTracks(peer)

  // const dc = peer.createDataChannel('channel')
  // dc.addEventListener('open', () => {
  //   console.log('Connection opened!')
  // })

  const remoteVideo = createVideo(peerUsername)

  setOnTrack(peer, remoteVideo)

  mapPeers[peerUsername] = [peer, '']

  peer.addEventListener('iceconnectionstatechange', () => {
    const iceConnectionState = peer.iceConnectionState

    if (
      iceConnectionState === 'failed' ||
      iceConnectionState === 'disconnected' ||
      iceConnectionState === 'closed'
    ) {
      delete mapPeers[peerUsername]

      if (iceConnectionState != 'closed') {
        peer.close()
      }

      removeVideo(remoteVideo)
    }
  })

  peer.addEventListener('icecandidate', (e) => {
    if (e.candidate) {
      // console.log('[createOfferer()] New ice candidate: ', JSON.stringify(peer.localDescription))
      return
    }

    chatSocket.send(
      JSON.stringify({
        'now': 'new-offer',
        'message': {
          'sdp': peer.localDescription,
          'receiver_channel_name': receiver_channel_name
        }
      })
    )
  })
  
  peer.createOffer()
  .then(offer => peer.setLocalDescription(offer))
  .catch((error) => {
    console.error('createOffer() : ', error)
  })
  .then(() => {
    console.log('[createOfferer()] : Local description set successfully.')
  })
  .catch((error) => {
    console.error('createOffer2() : ', error)
  })
}

function createAnswerer(offer, peerUsername, receiver_channel_name) {
  const peer = new RTCPeerConnection(null)

  addLocalTracks(peer)
  
  const remoteVideo = createVideo(peerUsername)
  
  setOnTrack(peer, remoteVideo)
  
  // peer.addEventListener('datachannel', e => {
  //   peer.dc = e.channel
  //   peer.dc.addEventListener('open', () => {
  //     console.log('Connection opened!')
  //   })

  //   mapPeers[peerUsername] = [peer, peer.dc]
  // })

  peer.addEventListener('iceconnectionstatechange', () => {
    const iceConnectionState = peer.iceConnectionState
    
    if (
      iceConnectionState === 'failed' ||
      iceConnectionState === 'disconnected' ||
      iceConnectionState === 'closed'
      ) {
        delete mapPeers[peerUsername]
        
        if (iceConnectionState != 'closed') {
          peer.close()
        }
        
        removeVideo(remoteVideo)
      }
    })
    
  peer.addEventListener('icecandidate', e => {
    if (e.candidate) {
      // console.log('[createAnswerer()] New ice candidate: ', JSON.stringify(peer.localDescription))
      
      return
    }

    chatSocket.send(
      JSON.stringify({
        'now': 'new-answer',
        'message': {
          'sdp': peer.localDescription,
          'receiver_channel_name': receiver_channel_name
        }
      })
    )
  })

  peer.setRemoteDescription(offer)
  .then(() => {
    console.log('Remote description set successfully for %s.', peerUsername)

    return peer.createAnswer()
  })
  .catch(error => {
    console.error('[setRemoteDescription(offer)] RTCPeerConnection.createAnswer : ', error)
  })
  .then(answer => {
    console.log('answer created!')

    peer.setLocalDescription(answer)
  })
  .catch((error) => {
    console.error('[setRemoteDescription(offer)] .setLocalDescription() : ', error)
  })
}

// Video Stream Create, Remove
function createVideo(peerUsername) {
  const videoContainer = document.getElementById('video-container')
  const remoteVideo = document.createElement('video')

  remoteVideo.id = peerUsername + '-video'
  remoteVideo.autoplay = true
  remoteVideo.playsInline = true

  const videoWrapper = document.createElement('div')
  videoWrapper.textContent=peerUsername

  videoContainer.appendChild(videoWrapper)
  videoWrapper.appendChild(remoteVideo)

  return remoteVideo
}

function removeVideo(video) {
  const videoWrapper = video.parentNode

  videoWrapper.parentNode.removeChild(videoWrapper)
}

// Track 설정
function addLocalTracks(peer) {
  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream)
  })
}

function setOnTrack(peer, remoteVideo) {
  const remoteStream = new MediaStream()

  remoteVideo.srcObject = remoteStream

  peer.addEventListener('track', async (e) => {
    remoteStream.addTrack(e.track, remoteStream)
  })
}