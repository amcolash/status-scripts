const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const axios = require('axios');
const express = require('express');
const FileStore = require('fs-store').FileStore;
const moment = require('moment');

if (!fs.existsSync(path.resolve(__dirname, '.env'))) {
  console.error('.env file missing, please make one!');
  process.exit(1);
}

require('dotenv').config({path: path.resolve(__dirname, '.env')});
const store = new FileStore(path.resolve(__dirname, 'data/outlook_token.json'));

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const PLUGIN = process.env.PLUGIN;
const PORT = process.env.PORT || 9002;
const REDIRECT = `http://localhost:${PORT}/callback`;
const scopes = 'offline_access calendars.read';
const ERRORS = true;

const app = express();
app.listen(PORT);
console.log(`Listening on ${PORT}`);

let ACCESS, REFRESH;
REFRESH = store.get('microsoftRefresh');

setIntervalImmediately(() => {
  getEvents();
}, 60 * 1000);

app.get('/', (req, res) => {
  getEvents(res);
});

app.get('/login', (req, res) => {
  res.redirect('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scopes,
      redirect_uri: REDIRECT
    })
  );
});

app.get('/callback', (req, res) => {
  //console.log(req.query);
  const code = req.query.code || null;

  const data = {
    code: code,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
    scope: scopes,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };

  axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    REFRESH = response.data.refresh_token;
    store.set('microsoftRefresh', REFRESH);

    res.redirect('/');
  }).catch(err => {
    if (ERRORS) console.error(err.response || err);
    const info = 'Error getting access token from authorization code'
    res.status(500).send(info);
    updatePlugin(info);
  });
});

function getAccess(res, cb) {
  const data = {
    grant_type: 'refresh_token',
    refresh_token: REFRESH,
    scope: scopes,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };
  axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    if (res) res.redirect('/');
    else if (cb) cb();
  }).catch(err => {
    if (ERRORS) console.error(err.response || err);
    const info = 'Error getting access token from refresh token';
    if (res) res.status(500).send(info);
    updatePlugin(info);
  })
}

function getEvents(res) {
  if (ACCESS) {
    axios.get('https://graph.microsoft.com/v1.0/me/calendars', {
      headers: {
        Authorization: 'Bearer ' + ACCESS
      }
    }).then(response => {
      const now = moment();
      const start = moment().startOf('d');
      const end = start.clone().add(7, 'd');

      const data = {
        startdatetime: start.toISOString(),
        enddatetime: end.toISOString(),
        $top: 50, // 50 items per page
      };

      let p = response.data.value.map(calendar => {
        return axios.get(`https://graph.microsoft.com/v1.0/me/calendars/${calendar.id}/calendarview?` + querystring.stringify(data), {
          headers: {
            Authorization: 'Bearer ' + ACCESS,
            Prefer: 'outlook.timezone="Pacific Standard Time"'
          }
        });
      });

      axios.all(p).then(data => {
        let events = [];
        data.forEach(c => {
          c.data.value.forEach(e => {
            events.push({
              ...e,
              start: moment(e.start.dateTime),
              end: moment(e.end.dateTime)
            });
          });
        });

        // Sort results
        events = events.sort((a, b) => {
          return a.start - b.start
        });

        let next;
        events.some(e => { // .some allows for short-circuit
          // if the event hasn't quite started and has been accepted
          // and will happen within 3 days
          if (e.start.clone().add(5, 'm').isAfter(now) &&
            e.start.isBefore(now.clone().add(3, 'd')) &&
            e.showAs === 'busy' &&
            e.subject.toLowerCase().indexOf('standup') === -1 &&
            e.subject.toLowerCase().indexOf('triage') === -1) {

            next = e;
            return true;
          }
          return false;
        });

        const info = next ? truncateEvent(next.subject) + ' - ' + next.start.calendar() : 'No Upcoming Events';

        if (res) res.send(info);
        updatePlugin(info, events);
      }).catch(err => {
        if (ERRORS) console.error(err.response || err);
      });
    }).catch(err => {
      // Refresh token when expired
      if (err.response && err.response.status === 401) {
        console.log('Refreshing access token');
        getAccess(res, () => getEvents());
      } else {
        if (ERRORS) console.error(err.response || err);
        const info = 'Couldn\'t get upcoming events';
        updatePlugin(info);
        if (res) res.status(500).send(info);
      }
    });
  } else if (REFRESH) {
    console.log('Getting access token');
    getAccess(res, () => getEvents());
  } else {
    if (res) res.redirect('/login');
    const info = `Not logged in, please visit http://localhost:${PORT}`;
    updatePlugin(info);
  }
}

function truncateEvent(title) {
  if (title.length > 35) {
    return title.substring(0, 30) + '...';
  }

  return title;
}

function updatePlugin(info, data) {
  try {
    switch (PLUGIN) {
      case 'genmon':
        let file;
        if (data) {
          const startDay = moment().startOf('d');
          const endDay = moment().endOf('d');
          let tooltip = '';
          let count = 0;
          data.forEach(e => {
            if (e.start.isBetween(startDay, endDay) && e.subject.indexOf('Canceled') === -1) {
              tooltip += `${e.start.format('h:mma')} - ${e.end.format('h:mma')}: ${e.subject}\n`;
              count++;
            }
          });
          // Trim the ending newline
          tooltip = tooltip.substring(0, tooltip.length - 1);

          file = `<img>${__dirname}/icons/calendar.png</img><txt>  [${count} Today] ${info}</txt><tool>${tooltip}</tool>`;
        } else {
          file = info;
        }
        // Fix issues with & character
        file = file.replace(/&/g,'+');

        fs.writeFileSync(path.resolve(__dirname, 'data/outlook'), file);
        break;
      default:
        console.log(info);
        fs.writeFileSync(path.resolve(__dirname, 'data/outlook'), info);
        break;
    }
  } catch (err) {
    if (ERRORS) console.error(err);
  }
}

function setIntervalImmediately(func, interval) {
  func();
  return setInterval(func, interval);
}
