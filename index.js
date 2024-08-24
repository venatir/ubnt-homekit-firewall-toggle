const Unifi = require('node-unifi');
const hap = require('hap-nodejs');
const qrcode = require('qrcode-terminal');


const unifi_host = process.env.UNIFI_HOST;
const unifi_user = process.env.UNIFI_USER;
const unifi_pass = process.env.UNIFI_PASS;
const unifi_port = process.env.UNIFI_PORT || 443;
const unifi_access_device_name = process.env.UNIFI_ACCESS_DEVICE_NAME;
let unifi_device_hostname = process.env.UNIFI_DEVICE_HOSTNAME;
let unifi_device_mac = process.env.UNIFI_DEVICE_MAC;
const unifi_rule_name_template = process.env.UNIFI_RULE_NAME_TEMPLATE || "HomeKit rule for <DEVICE_HOSTNAME>";
const unifi_sslverify = false;
const service_port = process.env.SERVICE_PORT || 8080;
const service_ip = process.env.SERVICE_IP || "0.0.0.0";

const homekit_service_name_template = process.env.HOMEKIT_SERVICE_NAME_TEMPLATE || "Stop Internet Access for <DEVICE_HOSTNAME>";
const homekit_pin_code = process.env.HOMEKIT_PIN_CODE || '123-45-678';

const {Service, Characteristic} = hap;

class UnifiHomeKit {
    constructor(options) {
        this.options = options;
        this.unifiController = new Unifi.Controller({
            host: this.options.unifi_host,
            port: this.options.unifi_port,
            sslverify: this.options.unifi_sslverify,
            username: this.options.unifi_user,
            password: this.options.unifi_pass
        });

        this.unifi_host = options.unifi_host;
        this.unifi_user = options.unifi_user;
        this.unifi_pass = options.unifi_pass;
        this.unifi_port = options.unifi_port;
        this.unifi_access_device_name = options.unifi_access_device_name;
        this.unifi_device_hostname = options.unifi_device_hostname;
        this.unifi_device_mac = options.unifi_device_mac;
        this.unifi_rule_name_template = options.unifi_rule_name_template;
        this.unifi_sslverify = options.unifi_sslverify;
        this.unifi_rule_id = null;
        this.device_update_callback = options.device_update_callback;
    }

    static async createInstance(options) {
        const unifi = new UnifiHomeKit(options);
        await unifi.init();
        return unifi;
    }

    generateJSONRule(enabled) {
        const ret = {
            action: 'BLOCK',
            description: this.unifi_rule_name,
            enabled,
            matching_target: 'INTERNET',
            traffic_direction: 'TO',
            target_devices: [{client_mac: this.unifi_device_mac, type: 'CLIENT'}],
        };
        if (this.unifi_rule_id)
            ret._id = this.unifi_rule_id;
        return ret;
    }


    async init() {
        await this.unifiController.login();

        const managing_device = (await this.unifiController.getAccessDevices()).filter(x => x.name === unifi_access_device_name)?.[0];
        let managed_device;
        if (this.unifi_device_hostname) {
            managed_device = (await this.unifiController.getClientDevices()).filter(x => x.hostname === unifi_device_hostname)?.[0];
            this.unifi_device_mac = managed_device?.mac;
        }
        if (this.unifi_device_mac) {
            managed_device = (await this.unifiController.getClientDevices()).filter(x => x.mac === this.unifi_device_mac.toLowerCase())?.[0];
            this.unifi_device_hostname = managed_device?.hostname;
        }

        if (!managed_device || !managing_device) {
            console.error(`Device not found: managing_device:${managing_device} managed_device:${managed_device}`);
            return;
        }

        this.unifi_rule_name = unifi_rule_name_template.replace('<DEVICE_HOSTNAME>', this.unifi_device_hostname);

        let traffic_rule = await this.getRule();
        if (!traffic_rule) {
            console.log(`Creating rule: ${this.unifi_rule_name}`);
            traffic_rule = await this.unifiController.customApiRequest(`/v2/api/site/<SITE>/trafficrules`, 'POST', this.generateJSONRule(false));
            console.log(`Rule created: ${this.unifi_rule_name}`);
        } else {
            console.log(`Rule already exists: ${this.unifi_rule_name}`);
        }

        this.unifi_rule_id = traffic_rule._id;

        const listenData = await this.unifiController.listen();
        this.unifiController.on('device:update.generic', data => this.device_update_callback(data).bind(this));
    }

    async setRuleState(value) {
        console.log(`Switching rule ${this.unifi_rule_name} to ${value}`);
        await this.unifiController.customApiRequest(`/v2/api/site/<SITE>/trafficrules/${this.unifi_rule_id}`, 'PUT', this.generateJSONRule(value));
        console.log(`Rule ${this.unifi_rule_name} switched to ${value}`);
    }

    async getRule() { // true if rule is disabled
        return (await this.unifiController.customApiRequest(`/v2/api/site/<SITE>/trafficrules`, 'GET')).filter(x => x.description === this.unifi_rule_name)?.[0];
    }

    async getRuleState() { // true if rule is disabled
        return (await this.getRule())?.enabled;
    }

    destroy() {
        this.unifiController.logout();
    }
}


const main = async () => {
    const unifiHomeKit = await UnifiHomeKit.createInstance({
        unifi_host,
        unifi_user,
        unifi_pass,
        unifi_port,
        unifi_access_device_name,
        unifi_device_hostname,
        unifi_device_mac,
        unifi_rule_name_template,
        unifi_sslverify,
    });

    const homekit_service_name = homekit_service_name_template.replace('<DEVICE_HOSTNAME>', unifiHomeKit.unifi_device_hostname);

    const accessory = new hap.Accessory(homekit_service_name, hap.uuid.generate(unifiHomeKit.unifi_device_mac));
    const service = new Service.Switch(homekit_service_name);
    accessory.addService(service);
    service.getCharacteristic(Characteristic.On)
        .on('get', async (callback) => {
            console.log('getter called');
            callback(null, (await unifiHomeKit.getRuleState()));
        })
        .on('set', async (value, callback) => {
            console.log(`setter called. Switching to ${value}`);
            await unifiHomeKit.setRuleState(value);
            callback();
        });

    unifiHomeKit.device_update_callback = async (data) => {
        const relevant_event = data.filter(x => x.mac === this.unifi_device_mac)?.[0];
        if (relevant_event?.state === 1) {
            // setTimeout(async () => {
            const value = await unifiHomeKit.getRuleState();
            console.log(`update called. Switching to ${value}`);
            service.getCharacteristic(Characteristic.On).updateValue(value);
            // }, 5000);
        }
    };

    await accessory.publish({
        username: unifiHomeKit.unifi_device_mac,
        pincode: homekit_pin_code,
        category: hap.Categories.SWITCH,
        port: service_port,
        bind: service_ip,
    });
    console.log(accessory.setupURI())
    qrcode.generate(accessory.setupURI(), {small: true});

};
main().catch(console.error);

