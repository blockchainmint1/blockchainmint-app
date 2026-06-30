#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor still requires the Objective-C registration macro for pure-Swift plugins.
CAP_PLUGIN(LegacyDataBridge, "LegacyDataBridge",
    CAP_PLUGIN_METHOD(read, CAPPluginReturnPromise);
)
