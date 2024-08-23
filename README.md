# What's this?

This is a simple setup that uses `hap-nodejs` to interface with HomeKit and `node-unifi` to talk to my unifi devices.

The goal is to create a switch/toggle in my Apple Home app to be able to cut internet for some devices in my house.

This is specifically useful for other non-technical members of the family who for example might want to cut internet to something like an Apple TV - where there is no Screen Time.


# How to use it?

1. Set the following env vars:
  - `UNIFI_HOST` - mandatory. This is your Cloud Key or UDM IP
  - `UNIFI_USER` - mandatory. Unifi user name. My approach was to create a separate user without 2FA for this scenario. I set the user to only login locally and only gave it privileges to the network app.
  - `UNIFI_PASS` - mandatory. Unifi user password
  - `UNIFI_PORT` - optional. Defaults to `443`
  - `UNIFI_ACCESS_DEVICE_NAME` - mandatory. This is the device name of your router as shown in the Unifi interface. Code is easy enough to modify to use a mac address if you choose to.
  - `UNIFI_DEVICE_HOSTNAME` or UNIFI_DEVICE_MAC - mandatory. No need to set both. This is the device hostname you want to block - as seen by your router or the mac of the device. Only one is needed
  - `UNIFI_RULE_NAME_TEMPLATE` - optional. Defaults to `HomeKit rule for <DEVICE_HOSTNAME>`
  - `HOMEKIT_SERVICE_NAME_TEMPLATE` - optional. Defaults to `Stop Internet Access for <DEVICE_HOSTNAME>`
  - `HOMEKIT_PIN_CODE` - optional. Defaults to `123-45-678`
2. Run docker: `docker run docker pull ghcr.io/venatir/ubnt-homekit-firewall-toggle:latest`. Make sure to set the env vars above and the network should be `host`, not `bridge`, so that mDNS works correctly. Otherwise you'll need mDNS reflectors.
3. If you look at the output, you'll see a QR code that you can scan with your phone to add it to Apple Home. Alternatively, you can add manually using the `HOMEKIT_PIN_CODE` you set.
