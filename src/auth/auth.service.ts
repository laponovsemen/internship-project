import { Injectable, OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { jwtConstants } from "./constants";
import { UsersRepository } from "../users/users.reposiroty";
import { EmailAdapter } from "./email.adapter";
import { Common } from "../common";
import { emailDTO, UserDTO } from "../input.classes";
import { ObjectId } from "mongodb";
import { SecurityDevicesRepository } from "../security.devices/security.devices.repository";
import { randomUUID } from "crypto";


type payloadType = {
  userId: string,
  login: string,
  iat: number,
  exp: number

}

@Injectable()
export class AuthService implements OnModuleInit{
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private usersRepository: UsersRepository,
    private securityDevicesRepository: SecurityDevicesRepository,
    private emailAdapter: EmailAdapter,
    private common: Common,
  ) {}

  protected timeOfLivingAccessToken = "10m"
  protected timeOfLivingRefreshToken = "20m"
  async onModuleInit(){
    const token = await this.jwtService.signAsync({userId : randomUUID(), deviceId: randomUUID()},
      {secret : jwtConstants.secretForAccess})
    //console.log(token);
    const payload = await this.jwtService.verifyAsync(token,
      {secret : jwtConstants.secretForAccess})
    //console.log(payload);


  }
  async signIn(user : any, ip : string, title : string, deviceId : string) {

    const payload = { userId : user.id, login : user.login,ip, title,deviceId };
    //console.log(user._id!.toHexString(), "user._id user._id");
    return {
      access_token: await this.jwtService.signAsync(payload, {expiresIn: this.timeOfLivingAccessToken, secret :jwtConstants.secretForAccess}),
      refresh_token: await this.jwtService.signAsync(payload, {expiresIn: this.timeOfLivingRefreshToken, secret :jwtConstants.secretForRefresh}),
    };
  }

  async registration(userDTO: UserDTO) {
    const login : string = userDTO.login
    const email : string = userDTO.email
    const password : string = userDTO.password
    const foundUserByLogin = await this.usersRepository.findUserByLogin(login)
    console.log(foundUserByLogin, " foundUserByLogin in registration")
    const foundUserByEmail = await this.usersRepository.findUserByEmail(email)
    console.log(foundUserByEmail, " foundUserByEmail in registration")
    if (foundUserByLogin) {
      return {result : false, field : "login"}
    } else if (foundUserByEmail) {
      return {result : false, field : "email"}
    } else {
        const user = await this.usersRepository.createUnconfirmedUser(login, password, email)
      console.log(user, " unconfirmed user in registration ")
        const info = await this.emailAdapter.sendEmail(email, user.code)
      console.log(user.code, " code to create unconfirmed user")


        return {result : true, field : null, code : user.code}
      }
    }


  async registrationEmailResending(emailFromFront: emailDTO) {
    const email = emailFromFront.email
    const UserExists = await this.usersRepository.findUserByEmail(email)
    console.log(UserExists, " UserExists in registrationEmailResending")



    if (!UserExists) {
      return {result : false, field : "email", message : "user email doesnt exist"}
    } else if (UserExists.isConfirmed) {
      return {result : false, field : "email", message : "email already confirmed"}
    } else{
      const UserStatus = UserExists.code
      const confirmationCode = this.common.createEmailSendCode()
      await this.emailAdapter.sendEmail(email, confirmationCode)
      await this.usersRepository.changeUsersConfirmationCode(UserExists.id, confirmationCode)
      return {result : true, field : null, message : null, code : confirmationCode}
    }
  }

  async registrationConfirmation(code: string) {

    const foundUser = await this.usersRepository.findUserByRegistrationCode(code)

    if(!foundUser){
      console.log("user not found")
      return null
    }
    console.log(foundUser, " foundUser in registrationConfirmation")
    const foundUserCodeFreshness = await this.usersRepository.findUserCodeFreshness(foundUser)
    if(!foundUserCodeFreshness){
      console.log("usercode is unfresh")
      return null
    }

    console.log("usercode is fresh")

    await this.usersRepository.makeUserConfirmed(foundUser)

    return true
  }

  async getUserByToken(accessToken: any) {
    if(!accessToken){
      return null
    }

    console.log(accessToken, "accessToken");
    const payload = this.jwtService.decode(accessToken)
    console.log(payload, "payload")
    //if (typeof payload === "string") return undefined;
    if (!payload) return null;
    const userId = (payload as payloadType).userId

    //console.log(userId)
    console.log(userId, " userId")
    console.log(payload, " payload")
    console.log(accessToken, "accessToken in getUserByToken");

    return await this.usersRepository.findUserById(userId)

  }

  async refreshToken(refreshToken: string) {
    const refreshTokenVerification = await this.verifyRefreshToken(refreshToken)
    if (!refreshTokenVerification) {
      console.log("refreshTokenVerification is failed" );
      return null
    }
    const lastActiveDate : string = new Date().toISOString()
    const deviceId : string =  refreshTokenVerification.deviceId
    const foundDevice = await this.securityDevicesRepository.gedDeviceByDeviceId(deviceId)
    if(!foundDevice) return null;
    console.log(foundDevice, "=><=");
    console.log(refreshToken, "=><=");
    if(foundDevice.refreshToken !== refreshToken){
      console.log("refreshToken is not found in db" );
      return null
    }

    refreshTokenVerification.lastActiveDate = lastActiveDate
    console.log(refreshTokenVerification)
    console.log(foundDevice, " foundDevice")
    console.log(refreshToken, " refreshToken")
    const payload = { userId : refreshTokenVerification.userId,
      login : refreshTokenVerification.login,
      ip : refreshTokenVerification.ip,
      title: refreshTokenVerification.title,
      deviceId: refreshTokenVerification.deviceId,

    }

    const newAccessToken = await this.jwtService.signAsync(payload, {expiresIn: this.timeOfLivingAccessToken ,secret :jwtConstants.secretForAccess})
    const newRefreshToken = await this.jwtService.signAsync(payload, {expiresIn: this.timeOfLivingRefreshToken,secret :jwtConstants.secretForRefresh})
    console.log(refreshToken === newRefreshToken);
    console.log("refreshTokenlldkaslfksdfkspdk", refreshToken);
    console.log("newRefreshTokenldfms;lfdms;lkfm;ls", newRefreshToken);
    await this.securityDevicesRepository.updateSessionByDeviceId(deviceId, lastActiveDate, newRefreshToken)
    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
  }

  public async verifyRefreshToken(refreshToken: string) {
    try {
      return await this.jwtService.verifyAsync(refreshToken, {
        secret: jwtConstants.secretForRefresh
      })
    } catch (e) {
      return null
    }
  }

  async logout(refreshToken: string) {
    const refreshTokenVerification = await this.verifyRefreshToken(refreshToken)
    if (!refreshTokenVerification) {
      return null
    }
    const deviceId : string =  refreshTokenVerification.deviceId
    console.log(deviceId , " deviceId")
    const foundDevice = await this.securityDevicesRepository.gedDeviceByDeviceId(deviceId)
    if(!foundDevice) return null;
    if(foundDevice.refreshToken !== refreshToken){
      console.log("refreshToken is not found in db" );
      return null
    }

    return await this.securityDevicesRepository.deleteDeviceById(deviceId)
  }

  async getUserByRefreshToken(refreshToken : string) {
    if(!refreshToken){
      return null
    }
    const veriable = refreshToken
    console.log(veriable, "veriable");
    const payload = this.jwtService.decode(refreshToken)
    //if (typeof payload === "string") return undefined;
    if (!payload) return null;
    const userId = (payload as payloadType).userId

    //console.log(userId)
    console.log(userId, " userId")
    //console.log(payload, " payload")
    //console.log(accessToken, "accessToken in getUserByToken");

    return await this.usersRepository.findUserById(userId)
  }
}