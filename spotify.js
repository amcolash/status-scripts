const fs = require('fs');
const querystring = require('querystring');
const axios = require('axios');
const express = require('express');
const FileStore = require('fs-store').FileStore;

require('dotenv').config();
const store = new FileStore('data.json');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PLUGIN = process.env.PLUGIN;
const REDIRECT = 'http://localhost:8888/callback';
const ERRORS = false;

const app = express();
const PORT = process.env.PORT || 8888;

let ACCESS, REFRESH;
REFRESH = store.get('refresh');

setIntervalImmediately(() => {
  getNowPlaying();
}, 10000);

app.get('/', (req, res) => {
  getNowPlaying(res);
});

app.get('/login', (req, res) => {
  var scope = 'user-read-playback-state user-modify-playback-state';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT,
    })
  );
});

app.get('/callback', (req, res) => {
  const code = req.query.code || null;

  const data = {
    code: code,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };

  axios.post('https://accounts.spotify.com/api/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    REFRESH = response.data.refresh_token;
    store.set('refresh', REFRESH);

    getAccess(res);
  }).catch(err => {
    if (ERRORS) console.error(err.response);
    const info = 'Error getting access token from authorization code'
    res.status(500).send(info);
    updatePlugin(info);
  });
});

function getAccess(res, cb) {
  const data = {
    grant_type: 'refresh_token',
    refresh_token: REFRESH,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };
  axios.post('https://accounts.spotify.com/api/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    if (res) res.redirect('/');
    if (cb) cb();
  }).catch(err => {
    if (ERRORS) console.error(err.response);
    const info = 'Error getting access token from refresh token';
    if (res) res.status(500).send(info);
    updatePlugin(info);
  })
}

function getNowPlaying(res) {
  if (ACCESS) {
    axios.get('https://api.spotify.com/v1/me/player', {
      headers: {
        Authorization: 'Bearer ' + ACCESS
      }
    }).then(response => {
      const data =  response.data;
      const info = data.is_playing ? `${data.item.name} - ${data.item.artists[0].name}` : 'Nothing currently playing';
      updatePlugin(info);
      if (res) res.send(`You're all set to go!<br>Currently Playing: ${info}`);
    }).catch(err => {
      if (ERRORS) console.error(err.response);
      const info = 'Couldn\'t get currently playing data';
      updatePlugin(info);
      if (res) res.status(500).send(info);
    });
  } else if (REFRESH) {
    console.log('Getting access token');
    getAccess(res, () => getNowPlaying());
  } else {
    if (res) res.redirect('/login');
    const info = `Not logged in, please visit http://localhost:${PORT}`;
    updatePlugin(info);
  }
}

function updatePlugin(info) {
  switch (PLUGIN) {
    case 'genmon':
      const data = `<img>/usr/share/icons/hicolor/22x22/apps/spotify-client.png</img><txt> ${info}</txt><tool>${info}<tool>`;
      const notPlaying = '<txt> </txt><tool>Nothing Currently Playing</tool>';
      fs.writeFileSync('./info', info !== 'Nothing currently playing' ? data : notPlaying);
      break;
    default:
      console.log(info);
      break;
  }
}

function setIntervalImmediately(func, interval) {
  func();
  return setInterval(func, interval);
}

app.listen(PORT);
console.log(`Listening on ${PORT}`);