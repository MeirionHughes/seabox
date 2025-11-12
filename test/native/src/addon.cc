#include <node_api.h>

// Function that returns a simple string
napi_value GetMessage(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_string_utf8(env, "NATIVE_MODULE_TEST_SUCCESS", NAPI_AUTO_LENGTH, &result);
  return result;
}

// Function that adds two numbers
napi_value Add(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  double a, b;
  napi_get_value_double(env, args[0], &a);
  napi_get_value_double(env, args[1], &b);

  napi_value result;
  napi_create_double(env, a + b, &result);
  return result;
}

// Function that returns a magic number
napi_value GetMagicNumber(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_int32(env, 42, &result);
  return result;
}

// Initialize the module
napi_value Init(napi_env env, napi_value exports) {
  napi_value fn_getMessage;
  napi_create_function(env, nullptr, 0, GetMessage, nullptr, &fn_getMessage);
  napi_set_named_property(env, exports, "getMessage", fn_getMessage);

  napi_value fn_add;
  napi_create_function(env, nullptr, 0, Add, nullptr, &fn_add);
  napi_set_named_property(env, exports, "add", fn_add);

  napi_value fn_getMagicNumber;
  napi_create_function(env, nullptr, 0, GetMagicNumber, nullptr, &fn_getMagicNumber);
  napi_set_named_property(env, exports, "getMagicNumber", fn_getMagicNumber);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
