import Ember from 'ember';

export default Ember.Service.extend({
  flights: [],

  /*
   * Global time, can be:
   * null -> no time is set, don't show barogram crosshair/plane position
   * -1 -> always show the latest time/fix for each flight
   * >= 0 -> show the associated time in the barogram and on the map
   * @type {!Number}
   */
  time: null,

  timer: null,

  isRunning: Ember.computed.bool('timer'),

  startTimes: Ember.computed.mapBy('flights', 'startTime'),
  minStartTime: Ember.computed.min('startTimes'),

  endTimes: Ember.computed.mapBy('flights', 'endTime'),
  maxEndTime: Ember.computed.max('endTimes'),

  fixes: Ember.computed('flights.@each.time', 'time', function() {
    let time = this.get('time');
    return this.get('flights').map(flight => fix(flight, time));
  }),

  init() {
    this._super(...arguments);
    window.fixCalcService = this;
  },

  startPlayback() {
    let time = this.get('time');

    if (time === null || time === -1) {
      this.set('time', this.get('minStartTime'));
    }

    this.set('timer', Ember.run.later(this, 'onTick', 50));
  },

  stopPlayback() {
    let timer = this.get('timer');
    if (timer) {
      Ember.run.cancel(timer);
      this.set('timer', null);
    }
  },

  onTick() {
    let time = this.get('time') + 1;

    if (time > this.get('maxEndTime')) {
      this.stopPlayback();
    }

    this.set('time', time);
    this.set('timer', Ember.run.later(this, 'onTick', 50));
  }
});

function fix(flight, t) {
  if (t == -1)
    t = flight.get('endTime');
  else if (t < flight.get('startTime') || t > flight.get('endTime'))
    return Fix.create({ flight });

  let time = flight.get('time');

  let index = getNextSmallerIndex(time, t);
  if (index < 0 || index >= time.length - 1 ||
    time[index] == undefined || time[index + 1] == undefined)
    return Fix.create({ flight });

  let t_prev = time[index];
  let t_next = time[index + 1];

  return Fix.create({ flight, t, t_prev, t_next });
}

let Fix = Ember.Object.extend({
  time: Ember.computed.readOnly('t_prev'),

  coordinate: Ember.computed('flight.geometry', 't', function() {
    let t = this.get('t');
    if (!Ember.isNone(t)) {
      return this.get('flight.geometry').getCoordinateAtM(t);
    }
  }),

  lon: Ember.computed.readOnly('coordinate.0'),
  lat: Ember.computed.readOnly('coordinate.1'),

  'alt-msl': Ember.computed('coordinate.2', 'flight.geoid', function() {
    let altitude = this.get('coordinate.2');
    if (!Ember.isNone(altitude)) {
      return altitude - this.get('flight.geoid');
    }
  }),

  'alt-gnd': Ember.computed('alt-msl', 'elevation', function() {
    let altitude = this.get('alt-msl');
    let elevation = this.get('elevation');
    if (!Ember.isNone(altitude) && !Ember.isNone(elevation)) {
      let value = altitude - elevation;
      return (value >= 0) ? value : 0;
    }
  }),

  point: Ember.computed('coordinate', function() {
    let coordinate = this.get('coordinate');
    if (coordinate) {
      return new ol.geom.Point(coordinate);
    }
  }),

  heading: Ember.computed('_coordinate_prev', '_coordinate_next', function() {
    let prev = this.get('_coordinate_prev');
    let next = this.get('_coordinate_next');

    if (prev && next) {
      return Math.atan2(next[0] - prev[0], next[1] - prev[1]);
    }
  }),

  vario: Ember.computed('_coordinate_prev.2', '_coordinate_next.2', '_dt', function() {
    let prev = this.get('_coordinate_prev');
    let next = this.get('_coordinate_next');
    let dt = this.get('_dt');

    if (prev && next && dt) {
      return (next[2] - prev[2]) / dt;
    }
  }),

  speed: Ember.computed('_coordinate_prev', '_coordinate_next', '_dt', function() {
    let prev = this.get('_coordinate_prev');
    let next = this.get('_coordinate_next');
    let dt = this.get('_dt');

    if (prev && next && dt) {
      let loc_prev = ol.proj.transform(prev, 'EPSG:3857', 'EPSG:4326');
      let loc_next = ol.proj.transform(next, 'EPSG:3857', 'EPSG:4326');

      return geographicDistance(loc_next, loc_prev) / dt;
    }
  }),

  _dt: Ember.computed('t_prev', 't_next', function() {
    return this.get('t_next') - this.get('t_prev');
  }),

  _coordinate_prev: Ember.computed('flight.geometry', 't_prev', function() {
    return this.get('flight.geometry').getCoordinateAtM(this.get('t_prev'));
  }),

  _coordinate_next: Ember.computed('flight.geometry', 't_next', function() {
    return this.get('flight.geometry').getCoordinateAtM(this.get('t_next'));
  }),

  elevation: Ember.computed('flight.elev_h.[]', '_elev_index', function() {
    let elev_h = this.get('flight.elev_h');
    if (elev_h) {
      return elev_h[this.get('_elev_index')];
    }
  }),

  _elev_index: Ember.computed('flight.elev_t.[]', 't', function() {
    let elev_t = this.get('flight.elev_t');
    if (elev_t) {
      return getNextSmallerIndex(elev_t, this.get('t'));
    }
  })
});

Fix[Ember.NAME_KEY] = 'Fix';
