import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus, Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Headers, ForbiddenException, Query
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Request, Response } from "express";
import { AuthGuard, RefreshTokenAuthGuard } from "./auth.guard";
import { emailDTO, LoginDTO, UserDTO } from "../input.classes";
import { JwtService } from "@nestjs/jwt";
import { SecurityDevicesRepository } from "../security.devices/security.devices.repository";
import { UsersService } from "../users/users.service";
import { Common } from "../common";
import { ObjectId } from "mongodb";
import { jwtConstants } from "./constants";
import {AccessToken, RefreshToken} from "./decorators/public.decorator";
import {randomUUID} from "crypto";


@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService,
              protected readonly jwtService : JwtService,
              protected readonly common : Common,
              protected readonly usersService : UsersService,
              protected readonly securityDevicesRepository : SecurityDevicesRepository,
              ) {}

  @Post('password-recovery')
  @HttpCode(HttpStatus.OK)
  passwordRecovery(@Body() signInDto: Record<string, any>) {
  }

  @Post('new-password')
  @HttpCode(HttpStatus.OK)
  newPassword(@Body() signInDto: Record<string, any>) {
  }
  //@UseGuards(AuthGuard)

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req : Request,
              @Res() res: Response,
              @Body() signInDto: LoginDTO,
    @Headers("user-agent") deviceName = 'unknown',
    @Ip() ip: string,
  ) {

    const user = await this.usersService.findUserByLoginOrEmail(signInDto.loginOrEmail, signInDto.password);
    console.log(user)
    console.log(user)

    const deviceId = randomUUID()
    const result = await this.authService.signIn(user, ip, deviceName, deviceId);
    const newSession = await this.securityDevicesRepository.createNewSession(user, ip,  deviceName, deviceId, result.refresh_token)

    res.cookie('refreshToken', result.refresh_token, { httpOnly: true, secure: true })
    res.status(200).send({
      accessToken: result.access_token
    })
  }
  @UseGuards(RefreshTokenAuthGuard)
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Req() req: Request,
                     @Res() res: Response,
                     @RefreshToken() refreshToken) {
    console.log(refreshToken);

    const result = await this.authService.refreshToken(refreshToken)
    if (!result) {
      res.status(401).json({})
      return
    }

    res.cookie('refreshToken', result.refresh_token, { httpOnly: true, secure: true })
    res.status(200).send({
      accessToken: result.access_token
    })
  }

  @Post('registration-confirmation')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registrationConfirmation(@Res() res : Response,
                                 @Body() codeDTO: {code : string},
                                 @Query() codeObjetcFromQuery
                                 ) {
    console.log(" start registration-confirmation")
    const codeFromQuery = codeObjetcFromQuery.code
    const result = await this.authService.registrationConfirmation(codeFromQuery)
    if(!result){
      res.status(400).json({errorsMessages: [{ message: "Code already confirmed", field: "code" }]})
      return
    }
      res.status(204).json({})
  }

  @Post('registration')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registration(
    @Res() res : Response,
    @Body() userDTO: UserDTO) {
    console.log("start registrtion")
    const result = await this.authService.registration(userDTO)
    console.log(result, " result");
    console.log("finish registration")
    if(!result.result){
      return res.status(400).json({ errorsMessages: [{ message: "email already confirmed", field: result.field }] })

    }
    return res.status(201).json({
      code : result.code
    })

  }

  @Post('registration-email-resending')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registrationEmailResending(@Res() res: Response,
                                   @Body() emailDTO) {
    console.log(emailDTO , " email in registrationEmailResending")
    const result = await this.authService.registrationEmailResending(emailDTO)
    console.log(result, " result in registrationEmailResending")
    if (!result.result) {
      res.status(HttpStatus.BAD_REQUEST).json({errorsMessages: [{ message: result.message, field: result.field }]})
    } else {
      res.status(HttpStatus.CREATED).json({code: result.code})
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request,
               @Res({ passthrough: true }) res: Response) {
    console.log(req.cookies, " Cookies in the Post Logout Procedure")
    //console.log(req, "All request Params in the Post Logout Procedure")
    const refreshToken = req.cookies.refreshToken


    const result = await this.authService.logout(refreshToken)
    if (!result) {
      throw new UnauthorizedException()
    }
    return result
  }


  @UseGuards(AuthGuard)
  @Get('/me')
  async getProfile(@Res({passthrough : true}) res: Response,
                   @Req() req : Request,
                   @AccessToken() accessToken) {
    console.log(" start getting my profile")
    console.log(accessToken, " refreshToken while getProfile")
    const refreshTokenValidation = this.authService.verifyRefreshToken(accessToken)
    if (!refreshTokenValidation) {
      throw new UnauthorizedException()
    }
    console.log(" refreshTokenValidation passed")
    const result = await this.authService.getUserByToken(accessToken);
    console.log(result, "result");

    return {
      userId : result.id,
      email : result.email,
      login : result.login
    }
  }
}