let mediaRecorder;
let recordedChunks = [];
let stream;

document.getElementById('start').onclick = async () => {
  recordedChunks = [];
  stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  document.getElementById('preview').srcObject = stream;
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    document.getElementById('preview').src = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'recorded.webm';
    a.textContent = 'ダウンロード';
    const dl = document.getElementById('download');
    dl.innerHTML = '';
    dl.appendChild(a);
    if (stream) stream.getTracks().forEach(track => track.stop());
  };

  mediaRecorder.start();
  document.getElementById('start').disabled = true;
  document.getElementById('stop').disabled = false;
};

document.getElementById('stop').onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  document.getElementById('start').disabled = false;
  document.getElementById('stop').disabled = true;
};