describe("email template loading", () => {
  it("loads OTP utilities without a prebuilt dist email bundle", () => {
    jest.resetModules();

    expect(() => require("../src/utils/otp")).not.toThrow();
  });
});
