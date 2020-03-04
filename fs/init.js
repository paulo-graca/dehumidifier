load('api_config.js');
load('api_events.js');
load('api_gpio.js');
load('api_pwm.js');
load('api_mqtt.js');
load('api_net.js');
load('api_sys.js');
load('api_timer.js');

let relay_pin = Cfg.get('pins.relay');
//Switch button - to delete
//let sw_pin = Cfg.get('pins.sw');
let photoresistor_pin = Cfg.get('pins.pw');
let photoresistor_error_pin = Cfg.get('pins.err');
let servoGpio = Cfg.get('pins.servo');
let pub_topic = 'devices/' + Cfg.get('device.id') + '/state'; //on, off, error
let sub_topic = 'devices/' + Cfg.get('device.id') + '/commands';

//Use servo?
let useServo = false;
let servoStart = 0.055;
let servoPushDuration = 3000;
let servoEnd = 0.095;
let isServoOperating = false;



// Keep relay OFF by default
GPIO.set_mode(relay_pin, GPIO.MODE_OUTPUT);
GPIO.write(relay_pin, 0);



function updateStatusCallback () {
  print("read(", photoresistor_pin, ") --> The statement 'The sensor is on' currently is " , GPIO.read(photoresistor_pin) === 1 ? "TRUE" : "FALSE");
  publishStatus();
}

// Configure photoresistors pin
GPIO.set_mode(photoresistor_pin, GPIO.MODE_INPUT);
GPIO.set_int_handler(photoresistor_pin, GPIO.INT_EDGE_ANY, updateStatusCallback, null); //set handler
GPIO.enable_int(photoresistor_pin); //enable interrupt

GPIO.set_mode(photoresistor_error_pin, GPIO.MODE_INPUT);
GPIO.set_int_handler(photoresistor_error_pin, GPIO.INT_EDGE_ANY, updateStatusCallback, null); //set handler
GPIO.enable_int(photoresistor_error_pin); //enable interrupt

//// Configure SW pin
//GPIO.set_mode(sw_pin, GPIO.MODE_INPUT);
//GPIO.set_pull(sw_pin, GPIO.PULL_NONE);

//// Each button press toggles the relay and sends an update
//GPIO.set_button_handler(sw_pin, GPIO.PULL_NONE, GPIO.INT_EDGE_POS, 100, function() {
//  GPIO.toggle(relay_pin);
//  publishState();
//}, null);

// Subscribe for commands over MQTT
MQTT.sub(sub_topic, function(conn, topic, msg) {
  if (msg === 'on') {
    setDeviceOn()
    GPIO.write(relay_pin, 1);
    print('device on action');
  } else if (msg === 'off') {
    setDeviceOff()
    GPIO.write(relay_pin, 0);
    print('device off action');
  } else if (msg === 'toggle') {
    GPIO.toggle(relay_pin);
    setDeviceToggle();
    print('device toggle action');
  } else {
    print("unrecognized command");
    return;
  }
  publishStatus();
}, null);

// Publish our status and setup
MQTT.setEventHandler(function(conn, ev, edata) {
  if (ev === MQTT.EV_CONNACK) {
    publishStatus();
  }
}, null);

// Monitor network connectivity.
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {
  let evs = '???';
  if (ev === Net.STATUS_DISCONNECTED) {
    evs = 'DISCONNECTED';
  } else if (ev === Net.STATUS_CONNECTING) {
    evs = 'CONNECTING';
  } else if (ev === Net.STATUS_CONNECTED) {
    evs = 'CONNECTED';
  } else if (ev === Net.STATUS_GOT_IP) {
    evs = 'GOT_IP';
  }
  print('== Net event:', ev, evs);
}, null);


function setDeviceOn()
{
  if (isServoOperating || isError() || isPinHigh()) return;
  moveServo();
}

function setDeviceOff()
{
  if (isServoOperating || isError() || !isPinHigh()) return;
  moveServo();
}

function moveServo()
{
  if( !useServo || isServoOperating) return;
  isServoOperating = true;
  print('moving servo');
  GPIO.set_mode(servoGpio, GPIO.MODE_OUTPUT);
  //move to position 0
  PWM.set(servoGpio, 50, servoEnd);
  //wait for servo
  Timer.set(servoPushDuration, false , function() {
      PWM.set(servoGpio, 50, servoStart);
      //wait for servo
      Timer.set(1000, false , function() {
        //turn off
        PWM.set(servoGpio, 50, 0);
        GPIO.set_mode(servoGpio, GPIO.MODE_INPUT);
        print('servo off');
        isServoOperating = false;
        publishStatus();
      }, null);
  }, null);
}

function setDeviceToggle()
{
  if (isServoOperating || isError()) return;
  if (isPinHigh()) {
    setDeviceOff();
  } else {
    setDeviceOn();
  }
}

// if photoresistor pin is high
function isPinHigh() 
{
  return GPIO.read(photoresistor_pin) === 1 ? true : false;
}

// if photoresistor error pin is high
function isError() 
{
  return GPIO.read(photoresistor_error_pin) === 1 ? true : false;
}

function publishStatus() {
  //MQTT.pub(pub_topic, GPIO.read(relay_pin) ? 'on' : 'off', 1);
  if (isError()) {
    MQTT.pub(pub_topic, 'error', 1);
    print('Published:', 'error');
    return;
  }
  MQTT.pub(pub_topic, GPIO.read(photoresistor_pin) ? 'on' : 'off', 1);
  print('Published status');
}


