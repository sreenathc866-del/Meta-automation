let ws;
let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let microphone;
let isRecording = false;
let isSpeaking = false;
let silenceTimer = null;
let currentAudio = null;

// Audio detection thresholds
const SILENCE_THRESHOLD = 1500; // ms of silence before sending audio
const VOLUME_THRESHOLD = 35; // Increased volume threshold to ignore background noise (out of 255)

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const connectionStatus = document.getElementById('connectionStatus');
const visualizer = document.getElementById('visualizer');
const bars = document.querySelectorAll('.bar');
const chatBox = document.getElementById('chatBox');

// Initialize WebSocket
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/voice`);
  
  ws.binaryType = 'blob';

  ws.onopen = () => {
    connectionStatus.classList.add('connected');
    statusText.innerText = 'Connected';
    startBtn.disabled = false;
  };

  ws.onclose = () => {
    connectionStatus.classList.remove('connected');
    statusText.innerText = 'Disconnected - Refresh page';
    startBtn.disabled = true;
    stopConversation();
  };

  ws.onerror = (err) => {
    console.error('WebSocket Error:', err);
  };

  ws.onmessage = async (event) => {
    if (typeof event.data === 'string') {
      // JSON message
      const data = JSON.parse(event.data);
      if (data.type === 'transcription') {
        appendMessage('user', data.text);
      } else if (data.type === 'answer') {
        appendMessage('ai', data.text);
      } else if (data.type === 'error') {
        console.error('Server Error:', data.message);
        appendMessage('ai', 'Error: ' + data.message);
      }
    } else {
      // Binary message (Audio)
      playAudio(event.data);
    }
  };
}

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  
  const label = document.createElement('div');
  label.className = 'message-label';
  label.innerText = role === 'user' ? 'You' : 'Oqulix AI';
  
  const content = document.createElement('div');
  content.innerText = text;
  
  div.appendChild(label);
  div.appendChild(content);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function playAudio(blob) {
  // If AI is already playing, stop it
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  
  const audioUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(audioUrl);
  currentAudio.playbackRate = 1.25; // Speed up the output answer slightly
  currentAudio.play();
  
  currentAudio.onended = () => {
    URL.revokeObjectURL(audioUrl);
    currentAudio = null;
    if (statusText.innerText === 'Processing...') {
      statusText.innerText = 'Listening...';
    }
  };
}

async function startConversation() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    visualizer.classList.add('active');
    statusText.innerText = 'Listening...';

    // Set up Audio Context for VAD
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Set up MediaRecorder
    // Use webm format as it's universally supported by MediaRecorder
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped. Chunks length:', audioChunks.length);
      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        // Send audio to WebSocket
        if (ws.readyState === WebSocket.OPEN) {
          statusText.innerText = 'Processing...';
          console.log('Sending audio blob of size:', audioBlob.size);
          ws.send(audioBlob);
        } else {
          console.error('WebSocket is not open. State:', ws.readyState);
        }
      }
    };

    // Monitoring loop
    function monitorVolume() {
      if (!audioContext) return;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;

      // Animate visualizer
      bars.forEach((bar, index) => {
        const h = Math.max(10, dataArray[index] / 2);
        bar.style.height = `${h}px`;
      });

      if (average > VOLUME_THRESHOLD) {
        // User is speaking!
        clearTimeout(silenceTimer);
        silenceTimer = null;
        
        // Interrupt AI if it's currently speaking
        if (currentAudio) {
          currentAudio.pause();
          currentAudio = null;
        }

        if (!isSpeaking) {
          console.log('Speech detected! Starting recording.');
          isSpeaking = true;
          statusText.innerText = 'Listening...';
          if (mediaRecorder.state === 'inactive') {
            audioChunks = [];
            mediaRecorder.start();
            console.log('MediaRecorder started.');
          } else {
            console.warn('MediaRecorder is not inactive! State:', mediaRecorder.state);
          }
        }
      } else {
        // User is silent
        if (isSpeaking) {
          if (!silenceTimer) {
            console.log('Silence detected, starting timer...');
            silenceTimer = setTimeout(() => {
              console.log('Silence timer finished. Stopping recording.');
              isSpeaking = false;
              silenceTimer = null;
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop(); // This triggers onstop and sends data
              } else {
                console.warn('MediaRecorder not recording! State:', mediaRecorder.state);
              }
            }, SILENCE_THRESHOLD);
          }
        }
      }

      requestAnimationFrame(monitorVolume);
    }

    monitorVolume();

  } catch (err) {
    console.error('Error accessing microphone:', err);
    alert('Could not access microphone. Please ensure permissions are granted.');
  }
}

const inputForm = document.getElementById('inputForm');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');

function stopConversation() {
  startBtn.style.display = 'inline-block';
  stopBtn.style.display = 'none';
  visualizer.classList.remove('active');
  statusText.innerText = 'Connected';

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

function handleTextSubmit(e) {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    appendMessage('user', text);
    statusText.innerText = 'Processing...';
    ws.send(JSON.stringify({ type: 'text', text: text }));
    textInput.value = '';
  } else {
    alert('Not connected to server. Please wait or refresh the page.');
  }
}

startBtn.addEventListener('click', startConversation);
stopBtn.addEventListener('click', stopConversation);
inputForm.addEventListener('submit', handleTextSubmit);

// Init
startBtn.disabled = true;
initWebSocket();
