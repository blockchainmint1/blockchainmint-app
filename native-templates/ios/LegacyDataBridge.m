//
//  LegacyDataBridge.m
//  Required Capacitor plugin registration glue — Capacitor still needs the
//  Objective-C macro even for pure-Swift plugins. Drop next to the .swift file.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LegacyDataBridge, "LegacyDataBridge",
    CAP_PLUGIN_METHOD(read, CAPPluginReturnPromise);
)
